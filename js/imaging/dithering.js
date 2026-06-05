// Binarization engine. Operates on the R channel (assumed to hold the
// contrast-adjusted grayscale), reducing each pixel to 0 or 255, then mirrors R
// into G/B for the preview. Methods fall in three families:
//   - threshold:  binary (fixed), otsu (auto global), adaptive (local mean)
//   - ordered:    bayer 4x4 / 8x8 (best for crisp, repeatable pixel-art looks)
//   - diffusion:  floyd-steinberg, jarvis, stucki, sierra, burkes, atkinson
//                 (best for reproducing continuous tone close to the original)
// All diffusion kernels run in a float buffer (no truncation/clamping error
// loss) with serpentine scanning (alternating row direction) to suppress the
// directional "worm" artifacts plain raster diffusion produces.

// --- Ordered (Bayer) threshold matrices, flattened, scaled to 0..255 ---------

// Kept verbatim from the original 4x4 map so existing "bayer" output is stable.
const BAYER_4X4 = [
    15, 135, 45, 165,
    195, 75, 225, 105,
    60, 180, 30, 150,
    240, 120, 210, 90,
];

// Recursive Bayer matrix generator (n must be a power of two). Returns values
// 0..n*n-1 in row-major order.
function generateBayer(n) {
    let matrix = [0];
    let size = 1;
    while (size < n) {
        const ns = size * 2;
        const next = new Array(ns * ns);
        for (let y = 0; y < size; y++) {
            for (let x = 0; x < size; x++) {
                const v = matrix[y * size + x] * 4;
                next[y * ns + x] = v;
                next[y * ns + (x + size)] = v + 2;
                next[(y + size) * ns + x] = v + 3;
                next[(y + size) * ns + (x + size)] = v + 1;
            }
        }
        matrix = next;
        size = ns;
    }
    return matrix;
}

// Scale a 0..(n*n-1) Bayer matrix into the 0..255 threshold range.
function scaleBayer(raw, n) {
    const cells = n * n;
    return raw.map((v) => ((v + 0.5) / cells) * 255);
}

const BAYER_8X8 = scaleBayer(generateBayer(8), 8);

// --- Error-diffusion kernels: [dx, dy, weight], applied with a divisor --------

const KERNELS = {
    floydsteinberg: {
        divisor: 16,
        cells: [[1, 0, 7], [-1, 1, 3], [0, 1, 5], [1, 1, 1]],
    },
    jarvis: {
        divisor: 48,
        cells: [
            [1, 0, 7], [2, 0, 5],
            [-2, 1, 3], [-1, 1, 5], [0, 1, 7], [1, 1, 5], [2, 1, 3],
            [-2, 2, 1], [-1, 2, 3], [0, 2, 5], [1, 2, 3], [2, 2, 1],
        ],
    },
    stucki: {
        divisor: 42,
        cells: [
            [1, 0, 8], [2, 0, 4],
            [-2, 1, 2], [-1, 1, 4], [0, 1, 8], [1, 1, 4], [2, 1, 2],
            [-2, 2, 1], [-1, 2, 2], [0, 2, 4], [1, 2, 2], [2, 2, 1],
        ],
    },
    sierra: {
        divisor: 32,
        cells: [
            [1, 0, 5], [2, 0, 3],
            [-2, 1, 2], [-1, 1, 4], [0, 1, 5], [1, 1, 4], [2, 1, 2],
            [-1, 2, 2], [0, 2, 3], [1, 2, 2],
        ],
    },
    burkes: {
        divisor: 32,
        cells: [
            [1, 0, 8], [2, 0, 4],
            [-2, 1, 2], [-1, 1, 4], [0, 1, 8], [1, 1, 4], [2, 1, 2],
        ],
    },
    // Atkinson spreads only 6/8 of the error (the missing 2/8 boosts contrast).
    atkinson: {
        divisor: 8,
        cells: [[1, 0, 1], [2, 0, 1], [-1, 1, 1], [0, 1, 1], [1, 1, 1], [0, 2, 1]],
    },
};

// --- Implementations ----------------------------------------------------------

function thresholdInPlace(data, len, threshold) {
    for (let i = 0; i < len; i += 4) {
        data[i] = data[i] < threshold ? 0 : 255;
    }
}

// Ordered dithering: each pixel is compared to its position's matrix threshold,
// so a flat tone V lights ~V/255 of cells (correct average brightness). The user
// threshold biases the whole map (128 => neutral / pure ordered).
function ordered(data, width, threshold, matrix, n) {
    const len = data.length;
    const bias = 128 - threshold;
    for (let i = 0; i < len; i += 4) {
        const p = i / 4;
        const x = p % width;
        const y = (p - x) / width;
        data[i] = (data[i] + bias) > matrix[(y % n) * n + (x % n)] ? 255 : 0;
    }
}

// Generic serpentine error diffusion over a float buffer.
function diffuse(data, width, height, threshold, kernel) {
    const npix = width * height;
    const buf = new Float32Array(npix);
    for (let p = 0; p < npix; p++) buf[p] = data[p * 4];

    const cells = kernel.cells;
    const divisor = kernel.divisor;
    for (let y = 0; y < height; y++) {
        const ltr = (y & 1) === 0; // serpentine: even rows L->R, odd rows R->L
        const xStart = ltr ? 0 : width - 1;
        const xEnd = ltr ? width : -1;
        const xStep = ltr ? 1 : -1;
        for (let x = xStart; x !== xEnd; x += xStep) {
            const p = y * width + x;
            const old = buf[p];
            const np = old < threshold ? 0 : 255;
            const err = old - np;
            buf[p] = np;
            for (let k = 0; k < cells.length; k++) {
                const dx = ltr ? cells[k][0] : -cells[k][0];
                const ny = y + cells[k][1];
                const nx = x + dx;
                if (nx >= 0 && nx < width && ny < height) { // ny >= 0 always (dy >= 0)
                    buf[ny * width + nx] += (err * cells[k][2]) / divisor;
                }
            }
        }
    }
    for (let p = 0; p < npix; p++) data[p * 4] = buf[p];
}

// Otsu's method: pick the global threshold that maximizes between-class variance
// of the R-channel histogram. Best automatic cutoff for clean art / pixel art.
function otsuThreshold(data, npix) {
    const hist = new Array(256).fill(0);
    for (let p = 0; p < npix; p++) {
        let v = data[p * 4] | 0;
        if (v < 0) v = 0; else if (v > 255) v = 255;
        hist[v]++;
    }
    let sum = 0;
    for (let t = 0; t < 256; t++) sum += t * hist[t];
    let sumB = 0;
    let wB = 0;
    let maxVar = -1;
    let threshold = 128;
    for (let t = 0; t < 256; t++) {
        wB += hist[t];
        if (wB === 0) continue;
        const wF = npix - wB;
        if (wF === 0) break;
        sumB += t * hist[t];
        const mB = sumB / wB;
        const mF = (sum - sumB) / wF;
        const between = wB * wF * (mB - mF) * (mB - mF);
        if (between > maxVar) { maxVar = between; threshold = t; }
    }
    // Otsu's t means "values <= t are the dark class". Callers binarize with
    // `value < threshold`, so return t + 1 to put value == t on the dark side.
    return threshold + 1;
}

// Adaptive (Bradley) local thresholding via a summed-area table: each pixel is
// compared to the mean of a surrounding window. Excellent for text/line art and
// unevenly-lit images where a single global threshold fails. O(width*height).
function adaptive(data, width, height) {
    const stride = width + 1;
    const integral = new Float64Array(stride * (height + 1));
    for (let y = 0; y < height; y++) {
        let rowSum = 0;
        for (let x = 0; x < width; x++) {
            rowSum += data[(y * width + x) * 4];
            integral[(y + 1) * stride + (x + 1)] = integral[y * stride + (x + 1)] + rowSum;
        }
    }
    const window = Math.max(2, Math.floor(Math.min(width, height) / 8));
    const half = window >> 1;
    const t = 0.15; // fraction below local mean that still counts as "dark"
    for (let y = 0; y < height; y++) {
        const y1 = Math.max(0, y - half);
        const y2 = Math.min(height - 1, y + half);
        for (let x = 0; x < width; x++) {
            const x1 = Math.max(0, x - half);
            const x2 = Math.min(width - 1, x + half);
            const count = (x2 - x1 + 1) * (y2 - y1 + 1);
            const sum = integral[(y2 + 1) * stride + (x2 + 1)]
                - integral[y1 * stride + (x2 + 1)]
                - integral[(y2 + 1) * stride + x1]
                + integral[y1 * stride + x1];
            const mean = sum / count;
            const i = (y * width + x) * 4;
            data[i] = data[i] <= mean * (1 - t) ? 0 : 255;
        }
    }
}

// --- Dispatch -----------------------------------------------------------------

export function applyDithering(data, width, threshold, method) {
    const len = data.length;
    const npix = len / 4;
    const height = width > 0 ? npix / width : 0;

    switch (method) {
        case "bayer":
            ordered(data, width, threshold, BAYER_4X4, 4);
            break;
        case "bayer8":
            ordered(data, width, threshold, BAYER_8X8, 8);
            break;
        case "otsu":
            thresholdInPlace(data, len, otsuThreshold(data, npix));
            break;
        case "adaptive":
            adaptive(data, width, height);
            break;
        case "floydsteinberg":
        case "jarvis":
        case "stucki":
        case "sierra":
        case "burkes":
        case "atkinson":
            diffuse(data, width, height, threshold, KERNELS[method]);
            break;
        default:
            thresholdInPlace(data, len, threshold);
            break;
    }

    for (let i = 0; i < len; i += 4) {
        data[i + 1] = data[i + 2] = data[i];
    }
}

// Operates on the R channel (assumed to hold the contrast-adjusted grayscale),
// reducing each pixel to 0 or 255, then mirrors R into G/B for the preview.
export function applyDithering(data, width, threshold, method) {
    const len = data.length;
    if (method === "bayer") {
        const bayer = [
            [15, 135, 45, 165],
            [195, 75, 225, 105],
            [60, 180, 30, 150],
            [240, 120, 210, 90],
        ];
        for (let i = 0; i < len; i += 4) {
            const x = (i / 4) % width;
            const y = Math.floor((i / 4) / width);
            const map = Math.floor((data[i] + bayer[x % 4][y % 4]) / 2);
            data[i] = map < threshold ? 0 : 255;
        }
    } else if (method === "floydsteinberg") {
        for (let i = 0; i < len; i += 4) {
            const np = data[i] < threshold ? 0 : 255;
            const err = Math.floor((data[i] - np) / 16);
            data[i] = np;
            data[i + 4] += err * 7;
            data[i + 4 * width - 4] += err * 3;
            data[i + 4 * width] += err * 5;
            data[i + 4 * width + 4] += err;
        }
    } else if (method === "atkinson") {
        for (let i = 0; i < len; i += 4) {
            const np = data[i] < threshold ? 0 : 255;
            const err = Math.floor((data[i] - np) / 8);
            data[i] = np;
            data[i + 4] += err;
            data[i + 8] += err;
            data[i + 4 * width - 4] += err;
            data[i + 4 * width] += err;
            data[i + 4 * width + 4] += err;
            data[i + 8 * width] += err;
        }
    } else {
        for (let i = 0; i < len; i += 4) {
            data[i] = data[i] < threshold ? 0 : 255;
        }
    }
    for (let i = 0; i < len; i += 4) {
        data[i + 1] = data[i + 2] = data[i];
    }
}

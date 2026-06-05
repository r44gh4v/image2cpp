import { normalizeSettings } from "../core/settings.js";
import { applyDithering } from "./dithering.js";
import { GifReader } from "../vendor/omggif.js";

function normalizeProcessingSettings(settings) {
    return normalizeSettings(settings || {});
}

function getThemeColors(theme) {
    let fg = [255, 255, 255];
    let bg = [0, 0, 0];
    if (theme === "oled-blue") fg = [0, 50, 255];
    if (theme === "oled-yellow") fg = [255, 215, 0];
    if (theme === "lcd-green") { fg = [0, 0, 0]; bg = [135, 175, 50]; }
    return { fg: fg, bg: bg };
}

function contrastFactor(contrast) {
    const c = contrast || 0;
    return (259 * (c + 255)) / (255 * (259 - c));
}

function buildMonoMap(imageData, width, height, safe, build, fg, bg) {
    const data = imageData.data;
    const factor = contrastFactor(safe.contrast);
    const threshold = safe.threshold;
    const invert = safe.invert;
    const invertBg = safe.invertBg;

    // Pass 1: grayscale + contrast (padding forced white, alpha left intact).
    for (let i = 0; i < data.length; i += 4) {
        if (data[i + 3] < 128) {
            data[i] = data[i + 1] = data[i + 2] = 255;
        } else {
            let gray = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
            gray = factor * (gray - 128) + 128;
            if (gray < 0) gray = 0; else if (gray > 255) gray = 255;
            data[i] = data[i + 1] = data[i + 2] = gray;
        }
    }

    // Pass 2: dithering reduces the R channel to 0/255.
    applyDithering(data, width, threshold, safe.dither);

    // Pass 3: bits (bright -> lit) + colorize preview.
    const binaryData = build ? new Uint8Array(width * height) : null;
    for (let i = 0; i < data.length; i += 4) {
        const pIdx = i / 4;
        let bit;
        if (data[i + 3] < 128) {
            bit = invertBg ? 1 : 0;
        } else {
            bit = data[i] >= 128 ? 1 : 0;
            if (invert) bit = bit === 1 ? 0 : 1;
        }
        if (build) binaryData[pIdx] = bit;
        const color = bit === 1 ? fg : bg;
        data[i] = color[0]; data[i + 1] = color[1]; data[i + 2] = color[2]; data[i + 3] = 255;
    }

    return { imageData: imageData, binaryData: binaryData, rgb565Data: null, rgb888Data: null };
}

function buildAlphaMap(imageData, width, height, safe, build, fg, bg) {
    const data = imageData.data;
    const threshold = safe.threshold;
    const invert = safe.invert;
    const binaryData = build ? new Uint8Array(width * height) : null;

    for (let i = 0; i < data.length; i += 4) {
        const pIdx = i / 4;
        let bit = data[i + 3] > threshold ? 1 : 0;
        if (invert) bit = bit === 1 ? 0 : 1;
        if (build) binaryData[pIdx] = bit;
        const color = bit === 1 ? fg : bg;
        data[i] = color[0]; data[i + 1] = color[1]; data[i + 2] = color[2]; data[i + 3] = 255;
    }

    return { imageData: imageData, binaryData: binaryData, rgb565Data: null, rgb888Data: null };
}

function buildColorMap(imageData, width, height, safe, build, is565) {
    const data = imageData.data;
    const factor = contrastFactor(safe.contrast);
    const invert = safe.invert;
    const rgb565Data = (build && is565) ? new Uint16Array(width * height) : null;
    const rgb888Data = (build && !is565) ? new Uint32Array(width * height) : null;

    for (let i = 0; i < data.length; i += 4) {
        const pIdx = i / 4;
        let r;
        let g;
        let b;
        if (data[i + 3] < 128) {
            r = g = b = 255; // transparent -> white background
        } else {
            r = factor * (data[i] - 128) + 128;
            g = factor * (data[i + 1] - 128) + 128;
            b = factor * (data[i + 2] - 128) + 128;
            r = r < 0 ? 0 : (r > 255 ? 255 : r);
            g = g < 0 ? 0 : (g > 255 ? 255 : g);
            b = b < 0 ? 0 : (b > 255 ? 255 : b);
        }
        r = Math.round(r); g = Math.round(g); b = Math.round(b);
        if (invert) { r = 255 - r; g = 255 - g; b = 255 - b; }

        let pr;
        let pg;
        let pb;
        if (is565) {
            const packed = ((r & 0xF8) << 8) | ((g & 0xFC) << 3) | ((b & 0xF8) >> 3);
            if (build) rgb565Data[pIdx] = packed;
            pr = r & 0xF8; pg = g & 0xFC; pb = b & 0xF8;
        } else {
            const packed = ((r & 0xFF) << 16) | ((g & 0xFF) << 8) | (b & 0xFF);
            if (build) rgb888Data[pIdx] = packed >>> 0;
            pr = r; pg = g; pb = b;
        }
        data[i] = pr; data[i + 1] = pg; data[i + 2] = pb; data[i + 3] = 255;
    }

    return { imageData: imageData, binaryData: null, rgb565Data: rgb565Data, rgb888Data: rgb888Data };
}

// core image manipulation using canvas API (stateless module-level functions)
let scratchCanvas = null;
let scratchCtx = null;

function ensureScratchCanvas(width, height) {
    if (typeof document === "undefined" || typeof document.createElement !== "function") {
        return null;
    }

    if (!scratchCanvas) {
        scratchCanvas = document.createElement("canvas");
        scratchCtx = scratchCanvas.getContext("2d", { willReadFrequently: true });
    }

    if (!scratchCtx) {
        return null;
    }

    if (scratchCanvas.width !== width) {
        scratchCanvas.width = width;
    }

    if (scratchCanvas.height !== height) {
        scratchCanvas.height = height;
    }

    return scratchCanvas;
}

function applyFiltersAndColorMap(imageData, width, height, settings, isNormalized, skipBinary) {
    const safe = isNormalized === true
        ? settings
        : normalizeProcessingSettings(settings);
    const build = skipBinary !== true;
    const format = safe.pixelFormat;

    if (format === "rgb565" || format === "rgb888") {
        return buildColorMap(imageData, width, height, safe, build, format === "rgb565");
    }
    const colors = getThemeColors(safe.theme);
    if (format === "alpha") {
        return buildAlphaMap(imageData, width, height, safe, build, colors.fg, colors.bg);
    }
    return buildMonoMap(imageData, width, height, safe, build, colors.fg, colors.bg);
}

export function loadImageElement(src) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = reject;
        img.src = src;
    });
}

export function decodeGif(arrayBuffer) {
    const reader = new GifReader(new Uint8Array(arrayBuffer));
    const width = reader.width;
    const height = reader.height;
    const frames = [];
    const framePixels = new Uint8ClampedArray(width * height * 4);
    let prevPixels = null;
    for (let i = 0; i < reader.numFrames(); i++) {
        const info = reader.frameInfo(i);
        if (info.disposal === 3) prevPixels = new Uint8ClampedArray(framePixels);
        reader.decodeAndBlitFrameRGBA(i, framePixels);
        frames.push({
            imageData: new ImageData(new Uint8ClampedArray(framePixels), width, height),
            delayMs: (info.delay || 0) * 10,
        });
        if (info.disposal === 2) {
            for (let y = info.y; y < info.y + info.height; y++) {
                for (let x = info.x; x < info.x + info.width; x++) {
                    const idx = (y * width + x) * 4;
                    framePixels[idx] = framePixels[idx + 1] = framePixels[idx + 2] = framePixels[idx + 3] = 0;
                }
            }
        } else if (info.disposal === 3 && prevPixels) {
            framePixels.set(prevPixels);
        }
    }
    return { width, height, frames };
}

export function processFrame(canvas, source, settings, options) {
    const safeSettings = normalizeProcessingSettings(settings);
    const renderOptions = options || {};
    // Smooth (bilinear) scaling matches javl/image2cpp: it preserves tonal
    // gradients when downscaling so the dithering methods can recover detail.
    // Turn it off ("Smooth scaling" unchecked) for pixel-perfect
    // nearest-neighbour output of crisp 1-bit art.
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    ctx.imageSmoothingEnabled = safeSettings.smoothScaling !== false;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.save();
    ctx.translate(canvas.width / 2, canvas.height / 2);
    if (safeSettings.rotate) ctx.rotate(safeSettings.rotate * Math.PI / 180);
    ctx.scale(safeSettings.flipH ? -1 : 1, safeSettings.flipV ? -1 : 1);

    const sw = source.naturalWidth || source.width;
    const sh = source.naturalHeight || source.height;
    let targetW = canvas.width;
    let targetH = canvas.height;
    if (safeSettings.rotate && safeSettings.rotate % 180 !== 0) { targetW = canvas.height; targetH = canvas.width; }

    let dw, dh;
    if (safeSettings.scale === "stretch") { dw = targetW; dh = targetH; }
    else if (safeSettings.scale === "fit") { const r = Math.min(targetW / sw, targetH / sh); dw = sw * r; dh = sh * r; }
    else { dw = sw; dh = sh; }
    dw = Math.round(dw); dh = Math.round(dh);
    const dx = -Math.round(dw / 2); const dy = -Math.round(dh / 2);

    if (typeof ImageData !== "undefined" && source instanceof ImageData) {
        const scratch = ensureScratchCanvas(sw, sh);
        if (scratch && scratchCtx) {
            scratchCtx.putImageData(source, 0, 0);
            ctx.drawImage(scratch, dx, dy, dw, dh);
        } else {
            ctx.drawImage(source, dx, dy, dw, dh);
        }
    } else {
        ctx.drawImage(source, dx, dy, dw, dh);
    }
    ctx.restore();

    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const result = applyFiltersAndColorMap(imageData, canvas.width, canvas.height, safeSettings, true, renderOptions.skipBinary === true);
    ctx.putImageData(result.imageData, 0, 0);
    return result;
}

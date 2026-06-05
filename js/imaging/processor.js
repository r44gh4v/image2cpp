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
    // invertBg only flips PADDING/transparent pixels (alpha < 128); invert flips
    // the lit/unlit bit of OPAQUE pixels. They are independent controls.
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

        // Storage packing stays keyed on the OUTPUT format (is565) so byte-array
        // output is unchanged.
        if (is565) {
            const packed = ((r & 0xF8) << 8) | ((g & 0xFC) << 3) | ((b & 0xF8) >> 3);
            if (build) rgb565Data[pIdx] = packed;
        } else {
            const packed = ((r & 0xFF) << 16) | ((g & 0xFF) << 8) | (b & 0xFF);
            if (build) rgb888Data[pIdx] = packed >>> 0;
        }

        // PREVIEW pixels are decoupled from storage: 565-output always previews
        // the truncated 5/6/5 look, and on an 888 array the user can opt into
        // the "565 Simulated" preview via theme without changing stored data.
        const trunc = is565 || safe.theme === "rgb-565";
        const pr = trunc ? (r & 0xF8) : r;
        const pg = trunc ? (g & 0xFC) : g;
        const pb = trunc ? (b & 0xF8) : b;
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

// Ping-pong canvases for progressive (multi-step) downscaling.
let dsA = null;
let dsACtx = null;
let dsB = null;
let dsBCtx = null;

function ensureDownscalePair() {
    if (typeof document === "undefined" || typeof document.createElement !== "function") {
        return false;
    }
    if (!dsA) {
        dsA = document.createElement("canvas");
        dsACtx = dsA.getContext("2d");
        dsB = document.createElement("canvas");
        dsBCtx = dsB.getContext("2d");
    }
    return !!(dsACtx && dsBCtx);
}

function blitHighQuality(ctx, src, sw, sh, dw, dh) {
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.clearRect(0, 0, dw, dh);
    if (sw === undefined) {
        ctx.drawImage(src, 0, 0, dw, dh);
    } else {
        ctx.drawImage(src, 0, 0, sw, sh, 0, 0, dw, dh);
    }
}

// A single bilinear drawImage from a large source straight to a tiny target
// aliases badly (it samples too few source texels). Halving the resolution in
// steps until within 2x of the target preserves far more detail. Returns a
// canvas (plus the used sub-rect size) or null when no downscale is needed.
function getDownscaledDrawable(source, sw, sh, dw, dh) {
    if (sw <= 2 * dw && sh <= 2 * dh) return null; // close enough; let the caller draw directly
    if (!ensureDownscalePair()) return null;

    // Stage the full-resolution source onto dsA.
    dsA.width = sw;
    dsA.height = sh;
    dsACtx.imageSmoothingEnabled = true;
    dsACtx.imageSmoothingQuality = "high";
    dsACtx.clearRect(0, 0, sw, sh);
    if (typeof ImageData !== "undefined" && source instanceof ImageData) {
        dsACtx.putImageData(source, 0, 0);
    } else {
        dsACtx.drawImage(source, 0, 0, sw, sh);
    }

    let src = dsA, dst = dsB, dstCtx = dsBCtx;
    let cw = sw, ch = sh;
    while (cw > 2 * dw || ch > 2 * dh) {
        const nw = Math.max(dw, Math.floor(cw / 2));
        const nh = Math.max(dh, Math.floor(ch / 2));
        dst.width = nw;
        dst.height = nh;
        blitHighQuality(dstCtx, src, cw, ch, nw, nh);
        // Swap roles; the freshly drawn canvas becomes the source next round.
        const prevSrc = src;
        src = dst;
        dst = prevSrc;
        dstCtx = (dst === dsA) ? dsACtx : dsBCtx;
        cw = nw;
        ch = nh;
    }
    return { canvas: src, width: cw, height: ch };
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
    const smoothing = safeSettings.smoothScaling !== false;
    ctx.imageSmoothingEnabled = smoothing;
    ctx.imageSmoothingQuality = "high";
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

    // For big-source -> small-target reductions, pre-shrink in halving steps so
    // the final placement only scales by <=2x (much less aliasing). Only when
    // smoothing is on — nearest-neighbour pixel art must stay single-step/crisp.
    const reduced = smoothing ? getDownscaledDrawable(source, sw, sh, Math.max(1, Math.ceil(dw)), Math.max(1, Math.ceil(dh))) : null;

    if (reduced) {
        ctx.drawImage(reduced.canvas, 0, 0, reduced.width, reduced.height, dx, dy, dw, dh);
    } else if (typeof ImageData !== "undefined" && source instanceof ImageData) {
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

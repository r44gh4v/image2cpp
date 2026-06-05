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

// core image manipulation using canvas API
const Processor = {
    sourceImage: null,
    sourceIsGif: false,
    gifFrames: [],
    _scratchCanvas: null,
    _scratchCtx: null,

    ensureScratchCanvas(width, height) {
        if (typeof document === "undefined" || typeof document.createElement !== "function") {
            return null;
        }

        if (!this._scratchCanvas) {
            this._scratchCanvas = document.createElement("canvas");
            this._scratchCtx = this._scratchCanvas.getContext("2d", { willReadFrequently: true });
        }

        if (!this._scratchCtx) {
            return null;
        }

        if (this._scratchCanvas.width !== width) {
            this._scratchCanvas.width = width;
        }

        if (this._scratchCanvas.height !== height) {
            this._scratchCanvas.height = height;
        }

        return this._scratchCanvas;
    },

    loadImage(src, callback) {
        const img = new Image();
        img.onload = () => {
            this.sourceIsGif = false;
            this.sourceImage = img;
            if (callback) callback();
        };
        img.src = src;
    },

    loadGif(buffer, callback) {
        const reader = new GifReader(new Uint8Array(buffer));
        this.sourceIsGif = true;
        this.gifFrames = [];
        this.sourceImage = { width: reader.width, height: reader.height };

        const framePixels = new Uint8ClampedArray(reader.width * reader.height * 4);
        let prevPixels = null;

        for (let i = 0; i < reader.numFrames(); i++) {
            const frameInfo = reader.frameInfo(i);

            if (frameInfo.disposal === 3) {
                prevPixels = new Uint8ClampedArray(framePixels);
            }

            reader.decodeAndBlitFrameRGBA(i, framePixels);

            const imgData = new ImageData(new Uint8ClampedArray(framePixels), reader.width, reader.height);
            this.gifFrames.push({ imgData, delay: frameInfo.delay });

            const disposal = frameInfo.disposal;
            if (disposal === 2) {
                for (let y = frameInfo.y; y < frameInfo.y + frameInfo.height; y++) {
                    for (let x = frameInfo.x; x < frameInfo.x + frameInfo.width; x++) {
                        const idx = (y * reader.width + x) * 4;
                        framePixels[idx] = 0;
                        framePixels[idx + 1] = 0;
                        framePixels[idx + 2] = 0;
                        framePixels[idx + 3] = 0;
                    }
                }
            } else if (disposal === 3 && prevPixels) {
                framePixels.set(prevPixels);
            }
        }
        if (callback) callback();
    },

    processFrame(canvas, sourceImgOrData, settings, options) {
        const safeSettings = normalizeProcessingSettings(settings);
        const renderOptions = options || {};

        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        // Smooth (bilinear) scaling matches javl/image2cpp: it preserves tonal
        // gradients when downscaling so the dithering methods can recover detail.
        // Turn it off ("Smooth scaling" unchecked) for pixel-perfect
        // nearest-neighbour output of crisp 1-bit art.
        ctx.imageSmoothingEnabled = safeSettings.smoothScaling !== false;
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        ctx.save();
        ctx.translate(canvas.width / 2, canvas.height / 2);
        if (safeSettings.rotate) ctx.rotate(safeSettings.rotate * Math.PI / 180);
        ctx.scale(safeSettings.flipH ? -1 : 1, safeSettings.flipV ? -1 : 1);

        let sw = this.sourceImage.width;
        let sh = this.sourceImage.height;
        let dx, dy, dw, dh;

        let targetW = canvas.width;
        let targetH = canvas.height;
        if (safeSettings.rotate && safeSettings.rotate % 180 !== 0) {
            targetW = canvas.height;
            targetH = canvas.width;
        }

        if (safeSettings.scale === 'stretch') {
            dw = targetW; dh = targetH;
            dx = -dw / 2; dy = -dh / 2;
        } else if (safeSettings.scale === 'fit') {
            const ratio = Math.min(targetW / sw, targetH / sh);
            dw = sw * ratio; dh = sh * ratio;
            dx = -dw / 2; dy = -dh / 2;
        } else {
            dw = sw; dh = sh;
            dx = -dw / 2; dy = -dh / 2;
        }

        // Snap to whole pixels so the draw never lands on a sub-pixel boundary.
        dw = Math.round(dw);
        dh = Math.round(dh);
        dx = -Math.round(dw / 2);
        dy = -Math.round(dh / 2);

        const hasImageDataCtor = typeof ImageData !== 'undefined';
        if (hasImageDataCtor && sourceImgOrData instanceof ImageData) {
            const scratchCanvas = this.ensureScratchCanvas(sw, sh);
            if (scratchCanvas && this._scratchCtx) {
                this._scratchCtx.putImageData(sourceImgOrData, 0, 0);
                ctx.drawImage(scratchCanvas, dx, dy, dw, dh);
            } else {
                ctx.drawImage(sourceImgOrData, dx, dy, dw, dh);
            }
        } else {
            ctx.drawImage(sourceImgOrData, dx, dy, dw, dh);
        }
        ctx.restore();

        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const result = this.applyFiltersAndColorMap(
            imageData,
            canvas.width,
            canvas.height,
            safeSettings,
            true,
            renderOptions.skipBinary === true,
        );

        ctx.putImageData(result.imageData, 0, 0);

        return result;
    },

    applyFiltersAndColorMap(imageData, width, height, settings, isNormalized, skipBinary) {
        const safe = isNormalized === true
            ? settings
            : normalizeProcessingSettings(settings);
        const build = skipBinary !== true;
        const colors = getThemeColors(safe.theme);
        const format = safe.pixelFormat;

        if (format === "rgb565" || format === "rgb888") {
            return buildColorMap(imageData, width, height, safe, build, format === "rgb565");
        }
        if (format === "alpha") {
            return buildAlphaMap(imageData, width, height, safe, build, colors.fg, colors.bg);
        }
        return buildMonoMap(imageData, width, height, safe, build, colors.fg, colors.bg);
    }
};

export { Processor };

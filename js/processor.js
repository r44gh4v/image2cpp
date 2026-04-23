function resolveSettingsContract() {
    if (typeof globalThis !== "undefined" && globalThis.Image2CppSettings) {
        return globalThis.Image2CppSettings;
    }
    if (typeof module !== "undefined" && module.exports && typeof require === "function") {
        try { return require("./core/settings.js"); } catch (_) { return null; }
    }
    return null;
}

function normalizeProcessingSettings(settings) {
    const contract = resolveSettingsContract();
    if (contract && typeof contract.normalizeSettings === "function") {
        return contract.normalizeSettings(settings || {});
    }

    const source = settings || {};

    return {
        width: Number(source.width) || 128,
        height: Number(source.height) || 64,
        scale: source.scale || "fit",
        contrast: Number.isFinite(Number(source.contrast)) ? Number(source.contrast) : 0,
        threshold: Number.isFinite(Number(source.threshold)) ? Number(source.threshold) : 128,
        processingMethod: "threshold",
        dither: false,
        invert: Boolean(source.invert),
        invertBg: source.invertBg === true,
        flipH: Boolean(source.flipH),
        flipV: Boolean(source.flipV),
        rotate: Number.isFinite(Number(source.rotate)) ? Number(source.rotate) : 0,
        outputFormat: source.outputFormat || "arduino",
        drawMode: source.drawMode || "vertical",
        varName: source.varName || "bitmap",
        theme: source.theme || "oled-white",
    };
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

            // Handle disposal for the NEXT frame
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

        // Push the colorized pixels back for the Visual Preview
        ctx.putImageData(result.imageData, 0, 0);

        return result;
    },

    applyFiltersAndColorMap(imageData, width, height, settings, isNormalized, skipBinary) {
        const safeSettings = isNormalized === true
            ? settings
            : normalizeProcessingSettings(settings);
        const shouldBuildBinary = skipBinary !== true;

        const data = imageData.data;
        const threshold = safeSettings.threshold;
        const invert = safeSettings.invert;
        const invertBg = safeSettings.invertBg;
        const contrast = safeSettings.contrast || 0;

        // Calculate contrast factor
        const factor = (259 * (contrast + 255)) / (255 * (259 - contrast));

        // Pass 1: Convert to Grayscale and adjust contrast
        for (let i = 0; i < data.length; i += 4) {
            const alpha = data[i + 3];

            // If transparent (e.g. padding or transparent PNG background), force its base color to pure white
            if (alpha < 128) {
                data[i] = data[i + 1] = data[i + 2] = 255;
            }

            // Perceptual Luminance conversion
            let gray = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];

            // Only apply adjustments to actual image pixels
            if (alpha >= 128) {
                gray = factor * (gray - 128) + 128;
                if (gray < 0) gray = 0; else if (gray > 255) gray = 255;
            } else {
                gray = 255; // Ensure padding strictly stays white for dither step safety 
            }

            data[i] = data[i + 1] = data[i + 2] = gray;
        }

        // Pass 2: Clean thresholding (no dithering) for dot-free output.
        for (let i = 0; i < data.length; i += 4) {
            const b = data[i];
            const whiteOrBlack = b >= threshold ? 255 : 0;
            data[i] = data[i + 1] = data[i + 2] = whiteOrBlack;
        }

        // Pass 3: Map to Binary Data (1s and 0s) and colorize for Live Preview
        const binaryData = shouldBuildBinary
            ? new Uint8Array(width * height)
            : null;

        let fgColor = [255, 255, 255]; // standard OLED white
        let bgColor = [0, 0, 0];       // standard black background

        if (safeSettings.theme === 'oled-blue') fgColor = [0, 50, 255];
        if (safeSettings.theme === 'oled-yellow') fgColor = [255, 215, 0];
        if (safeSettings.theme === 'lcd-green') { fgColor = [0, 0, 0]; bgColor = [135, 175, 50]; }

        for (let i = 0; i < data.length; i += 4) {
            let pIdx = i / 4;

            // Standard image2cpp logic assumes black maps to 1 (drawn), white maps to 0 (background).
            let isBlack = data[i] < 128;

            // Re-check alpha originally carried forward via bit 3
            let isPadding = data[i + 3] < 128;

            let bit = isBlack ? 1 : 0;

            // Invert controls image pixels; invertBg controls transparent/padding pixels.
            // This keeps both toggles independent while still allowing them to be combined.
            const shouldInvertPixel = isPadding ? invertBg : invert;
            if (shouldInvertPixel) {
                bit = bit === 1 ? 0 : 1;
            }

            if (shouldBuildBinary) {
                binaryData[pIdx] = bit;
            }

            // Paint visual preview:
            // the `bit === 1` means this pixel is "drawn/active" (so use fgColor)
            let color = bit === 1 ? fgColor : bgColor;
            data[i] = color[0]; data[i + 1] = color[1]; data[i + 2] = color[2]; data[i + 3] = 255;
        }

        return { imageData, binaryData };
    }
};

if (typeof module !== "undefined" && module.exports) {
    module.exports = Processor;
}

if (typeof globalThis !== "undefined") {
    globalThis.Processor = Processor;
}

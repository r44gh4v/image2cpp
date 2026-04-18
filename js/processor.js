// core image manipulation using canvas API
const Processor = {
    sourceImage: null,
    sourceIsGif: false,
    gifFrames: [],

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

        for (let i = 0; i < reader.numFrames(); i++) {
            const frameInfo = reader.frameInfo(i);
            const framePixels = new Uint8ClampedArray(reader.width * reader.height * 4);
            reader.decodeAndBlitFrameRGBA(i, framePixels);
            
            const imgData = new ImageData(framePixels, reader.width, reader.height);
            this.gifFrames.push({ imgData, delay: frameInfo.delay });
        }
        if (callback) callback();
    },

    processFrame(canvas, sourceImgOrData, settings) {
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        ctx.save();
        ctx.translate(canvas.width / 2, canvas.height / 2);
        if (settings.rotate) ctx.rotate(settings.rotate * Math.PI / 180);
        ctx.scale(settings.flipH ? -1 : 1, settings.flipV ? -1 : 1);

        let sw = this.sourceImage.width;
        let sh = this.sourceImage.height;
        let dx, dy, dw, dh;

        let targetW = canvas.width;
        let targetH = canvas.height;
        if (settings.rotate && settings.rotate % 180 !== 0) {
            targetW = canvas.height;
            targetH = canvas.width;
        }

        if (settings.scale === 'stretch') {
            dw = targetW; dh = targetH;
            dx = -dw / 2; dy = -dh / 2;
        } else if (settings.scale === 'fit') {
            const ratio = Math.min(targetW / sw, targetH / sh);
            dw = sw * ratio; dh = sh * ratio;
            dx = -dw / 2; dy = -dh / 2;
        } else {
            dw = sw; dh = sh;
            dx = -dw / 2; dy = -dh / 2;
        }

        if (sourceImgOrData instanceof ImageData) {
            const tempCnv = document.createElement('canvas');
            tempCnv.width = sw; tempCnv.height = sh;
            tempCnv.getContext('2d').putImageData(sourceImgOrData, 0, 0);
            ctx.drawImage(tempCnv, dx, dy, dw, dh);
        } else {
            ctx.drawImage(sourceImgOrData, dx, dy, dw, dh);
        }
        ctx.restore();

        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const result = this.applyFiltersAndColorMap(imageData, canvas.width, canvas.height, settings);
        
        // Push the colorized pixels back for the Visual Preview
        ctx.putImageData(result.imageData, 0, 0);
        
        return result;
    },

    applyFiltersAndColorMap(imageData, width, height, settings) {
        const data = imageData.data;
        const threshold = settings.threshold;
        const invert = settings.invert;
        const invertBg = settings.invertBg;
        const dither = settings.dither;
        const brightness = settings.brightness || 0;
        const contrast = settings.contrast || 0;

        // Calculate contrast factor
        const factor = (259 * (contrast + 255)) / (255 * (259 - contrast));

        // Pass 1: Convert to Grayscale and adjust brightness/contrast
        for (let i = 0; i < data.length; i += 4) {
            const alpha = data[i + 3];

            // If transparent (e.g. padding or transparent PNG background), force its base color to pure white
            if (alpha < 128) {
                data[i] = data[i+1] = data[i+2] = 255;
            }

            // Perceptual Luminance conversion
            let gray = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
            
            // Only apply adjustments to actual image pixels
            if (alpha >= 128) {
                gray += brightness;
                gray = factor * (gray - 128) + 128;
                if (gray < 0) gray = 0; else if (gray > 255) gray = 255;
            } else {
                gray = 255; // Ensure padding strictly stays white for dither step safety 
            }
            
            data[i] = data[i + 1] = data[i + 2] = gray;
        }

        // Pass 2: Dithering or direct thresholding
        if (dither) {
            for (let y = 0; y < height; y++) {
                for (let x = 0; x < width; x++) {
                    const idx = (y * width + x) * 4;
                    const oldPixel = data[idx];
                    const newPixel = oldPixel < threshold ? 0 : 255;

                    data[idx] = data[idx + 1] = data[idx + 2] = newPixel;
                    const quantError = oldPixel - newPixel;

                    const setErr = (nx, ny, errFactor) => {
                        if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
                            const nIdx = (ny * width + nx) * 4;
                            const newVal = data[nIdx] + quantError * errFactor;
                            data[nIdx] = data[nIdx + 1] = data[nIdx + 2] = newVal;
                        }
                    };

                    setErr(x + 1, y, 7 / 16);
                    setErr(x - 1, y + 1, 3 / 16);
                    setErr(x, y + 1, 5 / 16);
                    setErr(x + 1, y + 1, 1 / 16);
                }
            }
        } else {
            for (let i = 0; i < data.length; i += 4) {
                const b = data[i];
                const whiteOrBlack = b >= threshold ? 255 : 0;
                data[i] = data[i + 1] = data[i + 2] = whiteOrBlack;
            }
        }

        // Pass 3: Map to Binary Data (1s and 0s) and colorize for Live Preview
        const binaryData = new Uint8Array(width * height);

        let fgColor = [255, 255, 255]; // standard OLED white
        let bgColor = [0, 0, 0];       // standard black background

        if (settings.theme === 'oled-blue') fgColor = [0, 50, 255];
        if (settings.theme === 'oled-yellow') fgColor = [255, 215, 0];
        if (settings.theme === 'lcd-green') { fgColor = [0, 0, 0]; bgColor = [135, 175, 50]; }

        for (let i = 0; i < data.length; i += 4) {
            let pIdx = i / 4;

            // Standard image2cpp logic assumes black maps to 1 (drawn), white maps to 0 (background).
            let isBlack = data[i] < 128;
            
            // Re-check alpha originally carried forward via bit 3
            let isPadding = data[i + 3] < 128;

            // If invert is true, flip the drawn pixel logic.
            let bit = isBlack ? 1 : 0;
            
            if (invert) {
                if (isPadding && !invertBg) {
                    // Do not invert the background padding if toggle is disabled
                    bit = 0; 
                } else {
                    bit = bit === 1 ? 0 : 1;
                }
            }

            binaryData[pIdx] = bit;

            // Paint visual preview:
            // the `bit === 1` means this pixel is "drawn/active" (so use fgColor)
            let color = bit === 1 ? fgColor : bgColor;
            data[i] = color[0]; data[i+1] = color[1]; data[i+2] = color[2]; data[i+3] = 255;
        }

        return { imageData, binaryData };
    }
};

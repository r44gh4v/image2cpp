// Converting pixel/colour arrays to C/C++ output (javl-style) per pixel format.
function resolveSettingsContract() {
    if (typeof globalThis !== "undefined" && globalThis.Image2CppSettings) {
        return globalThis.Image2CppSettings;
    }
    if (typeof module !== "undefined" && module.exports && typeof require === "function") {
        try { return require("./core/settings.js"); } catch (_) { return null; }
    }
    return null;
}

function normalizeGeneratorSettings(settings) {
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
        dither: source.dither || "binary",
        pixelFormat: source.pixelFormat || "mono1",
        invert: Boolean(source.invert),
        invertBg: source.invertBg === true,
        flipH: Boolean(source.flipH),
        flipV: Boolean(source.flipV),
        rotate: Number.isFinite(Number(source.rotate)) ? Number(source.rotate) : 0,
        outputFormat: source.outputFormat || "arduino",
        drawMode: source.drawMode || "horizontal",
        bitSwap: Boolean(source.bitSwap),
        varName: source.varName || "byte array",
        theme: source.theme || "oled-white",
    };
}

function mergeFrameSettings(baseSettings, frameTuning) {
    const contract = resolveSettingsContract();
    if (contract && typeof contract.mergeFrameTuning === "function") {
        return contract.mergeFrameTuning(baseSettings, frameTuning || {});
    }

    return Object.assign({}, baseSettings, frameTuning || {});
}

function cTypeFor(pixelFormat) {
    if (pixelFormat === "rgb565") return "uint16_t";
    if (pixelFormat === "rgb888") return "unsigned long";
    return "unsigned char";
}

function tokenFor(value, pixelFormat) {
    if (pixelFormat === "rgb565") {
        return "0x" + (value & 0xFFFF).toString(16).toUpperCase().padStart(4, "0");
    }
    if (pixelFormat === "rgb888") {
        return "0x" + ((value >>> 0) & 0xFFFFFF).toString(16).toUpperCase().padStart(8, "0");
    }
    return "0x" + (value & 0xFF).toString(16).toUpperCase().padStart(2, "0");
}

function swapBits(b) {
    let v = b & 0xFF;
    v = ((v & 0xF0) >> 4) | ((v & 0x0F) << 4);
    v = ((v & 0xCC) >> 2) | ((v & 0x33) << 2);
    v = ((v & 0xAA) >> 1) | ((v & 0x55) << 1);
    return v & 0xFF;
}

function packMonoBytes(binaryData, width, height, drawMode) {
    const bytes = [];
    if (drawMode === "vertical") {
        const pages = Math.ceil(height / 8);
        for (let p = 0; p < pages; p++) {
            for (let x = 0; x < width; x++) {
                let cur = 0;
                for (let bit = 0; bit < 8; bit++) {
                    const y = p * 8 + bit;
                    if (y < height) cur |= (binaryData[y * width + x] << bit);
                }
                bytes.push(cur);
            }
        }
    } else {
        for (let y = 0; y < height; y++) {
            let cur = 0;
            let count = 0;
            for (let x = 0; x < width; x++) {
                cur = (cur << 1) | binaryData[y * width + x];
                count++;
                if (count === 8) { bytes.push(cur); cur = 0; count = 0; }
            }
            if (count > 0) { cur = cur << (8 - count); bytes.push(cur); }
        }
    }
    return bytes;
}

function buildTokens(data, safe) {
    const format = safe.pixelFormat;
    if (format === "rgb565" || format === "rgb888") {
        const tokens = [];
        for (let i = 0; i < data.length; i++) tokens.push(tokenFor(data[i], format));
        return tokens;
    }
    const drawMode = format === "alpha" ? "horizontal" : safe.drawMode;
    let bytes = packMonoBytes(data, safe.width, safe.height, drawMode);
    if (safe.bitSwap) bytes = bytes.map(swapBits);
    return bytes.map((b) => tokenFor(b, format));
}

function indentTokens(tokens) {
    const lines = [];
    for (let i = 0; i < tokens.length; i += 16) {
        lines.push("\t" + tokens.slice(i, i + 16).join(", "));
    }
    return lines.join(",\n");
}

function buildArrayBlock(tokens, safe, name) {
    const type = cTypeFor(safe.pixelFormat);
    const progmem = safe.outputFormat === "arduino" ? " PROGMEM" : "";
    return `// '${name}', ${safe.width}x${safe.height}px\n`
        + `const ${type} ${name} []${progmem} = {\n`
        + `${indentTokens(tokens)}\n`
        + `};`;
}

function buildConvenienceBlock(safe, names, totalBytes) {
    const type = cTypeFor(safe.pixelFormat);
    const arrName = safe.varName + "allArray";
    const list = names.map((n) => "\t" + n).join(",\n");
    return `// Array of all bitmaps for convenience. (Total bytes used to store images in PROGMEM = ${totalBytes})\n`
        + `const int ${arrName}_LEN = ${names.length};\n`
        + `const ${type}* ${arrName}[${names.length}] = {\n`
        + `${list}\n`
        + `};`;
}

function frameByteCount(safe) {
    const px = safe.width * safe.height;
    if (safe.pixelFormat === "rgb565") return px * 2;
    if (safe.pixelFormat === "rgb888") return px * 4;
    if (safe.pixelFormat === "mono1" && safe.drawMode === "vertical") {
        return Math.ceil(safe.height / 8) * safe.width;
    }
    return Math.ceil(safe.width / 8) * safe.height;
}

function pickPixelData(result, pixelFormat) {
    if (pixelFormat === "rgb565") return result.rgb565Data;
    if (pixelFormat === "rgb888") return result.rgb888Data;
    return result.binaryData;
}

const Generator = {

    generate(settings) {
        const safe = normalizeGeneratorSettings(settings);

        if (Processor.sourceIsGif && Processor.gifFrames.length > 0) {
            const tempCanvas = document.createElement('canvas');
            tempCanvas.width = safe.width;
            tempCanvas.height = safe.height;

            const blocks = [
                `// Generated by image2cpp\n// Frames: ${Processor.gifFrames.length}, Size: ${safe.width}x${safe.height} px`,
            ];
            const names = [];
            let totalBytes = 0;

            Processor.gifFrames.forEach((frame, idx) => {
                const frameSettings = mergeFrameSettings(safe, frame.tuning || {});
                const result = Processor.processFrame(tempCanvas, frame.imgData, frameSettings);
                const data = pickPixelData(result, safe.pixelFormat);
                const name = safe.varName + `_${idx}`;
                names.push(name);
                blocks.push(buildArrayBlock(buildTokens(data, safe), safe, name));
                totalBytes += frameByteCount(safe);
            });

            blocks.push(buildConvenienceBlock(safe, names, totalBytes));
            return blocks.join("\n\n") + "\n";
        }

        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = safe.width;
        tempCanvas.height = safe.height;
        const result = Processor.processFrame(tempCanvas, Processor.sourceImage, safe);
        const data = pickPixelData(result, safe.pixelFormat);
        const name = safe.varName;

        const blocks = [
            `// Generated by image2cpp\n// Size: ${safe.width}x${safe.height} px`,
            buildArrayBlock(buildTokens(data, safe), safe, name),
            buildConvenienceBlock(safe, [name], frameByteCount(safe)),
        ];
        return blocks.join("\n\n") + "\n";
    },

    generateFrame(data, settings, suffix = "") {
        const safe = normalizeGeneratorSettings(settings);
        return this.generateFrameFromNormalizedSettings(data, safe, suffix);
    },

    generateFrameFromNormalizedSettings(data, safe, suffix = "") {
        const name = safe.varName + suffix;

        if (!data || typeof data.length !== "number") {
            throw new Error("Generator.generateFrame requires a binaryData array-like input.");
        }

        const expectedLength = safe.width * safe.height;
        if (data.length < expectedLength) {
            throw new Error(`Generator.generateFrame expected at least ${expectedLength} pixels, received ${data.length}.`);
        }

        return buildArrayBlock(buildTokens(data, safe), safe, name) + "\n";
    }
};

if (typeof module !== 'undefined' && module.exports) {
    module.exports = Generator;
}

if (typeof globalThis !== 'undefined') {
    globalThis.Generator = Generator;
}

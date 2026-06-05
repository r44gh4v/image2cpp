export function cTypeFor(pixelFormat) {
    if (pixelFormat === "rgb565") return "uint16_t";
    if (pixelFormat === "rgb888") return "unsigned long";
    return "unsigned char";
}

export function tokenFor(value, pixelFormat) {
    if (pixelFormat === "rgb565") {
        return "0x" + (value & 0xFFFF).toString(16).toUpperCase().padStart(4, "0");
    }
    if (pixelFormat === "rgb888") {
        return "0x" + ((value >>> 0) & 0xFFFFFF).toString(16).toUpperCase().padStart(8, "0");
    }
    return "0x" + (value & 0xFF).toString(16).toUpperCase().padStart(2, "0");
}

export function swapBits(b) {
    let v = b & 0xFF;
    v = ((v & 0xF0) >> 4) | ((v & 0x0F) << 4);
    v = ((v & 0xCC) >> 2) | ((v & 0x33) << 2);
    v = ((v & 0xAA) >> 1) | ((v & 0x55) << 1);
    return v & 0xFF;
}

export function packMonoBytes(binaryData, width, height, drawMode) {
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

export function buildTokens(data, safe) {
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

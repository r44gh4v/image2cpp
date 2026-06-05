const HEX_NIBBLE = {
    "0": "0000", "1": "0001", "2": "0010", "3": "0011",
    "4": "0100", "5": "0101", "6": "0110", "7": "0111",
    "8": "1000", "9": "1001", "a": "1010", "b": "1011",
    "c": "1100", "d": "1101", "e": "1110", "f": "1111",
};

function hexToBinary(token) {
    let out = "";
    for (const ch of token.toLowerCase()) {
        const bits = HEX_NIBBLE[ch];
        if (!bits) return null;
        out += bits;
    }
    return out;
}

// Strip Arduino wrappers/comments/0x and split into hex tokens.
export function parseByteArrayText(text) {
    let input = String(text || "");
    input = input.replace(/const\s+(unsigned\s+char|uint8_t)\s+[a-zA-Z0-9_]+\s*\[\]\s*(PROGMEM\s*)?=\s*/g, "");
    input = input.replace(/\/\/[^\r\n]*/g, "");
    input = input.replace(/\};|\{/g, "");
    input = input.replace(/\r\n|\r|\n/g, ",");
    input = input.replace(/,{2,}/g, ",");
    input = input.replace(/\s/g, "");
    input = input.replace(/0[xX]/g, "");
    return input.split(",").filter((t) => t.length > 0);
}

export function bytesToImageData(tokens, width, height, orientation) {
    const imageData = new ImageData(width, height);
    const data = imageData.data;
    data.fill(0);
    for (let i = 0; i < data.length; i += 4) data[i + 3] = 255; // opaque

    const setPixel = (x, y, on) => {
        if (x < 0 || x >= width || y < 0 || y >= height) return;
        const idx = (y * width + x) * 4;
        const v = on ? 255 : 0;
        data[idx] = data[idx + 1] = data[idx + 2] = v;
    };

    if (orientation === "vertical") {
        let page = 0, x = 0, y = 7;
        for (const token of tokens) {
            let bin = hexToBinary(token);
            if (bin === null) throw new Error(`Invalid token: ${token}`);
            if (bin.length === 4) bin += "0000";
            for (const bit of bin) {
                setPixel(x, page * 8 + y, bit === "1");
                y--;
                if (y < 0) { y = 7; x++; if (x >= width) { x = 0; page++; } }
            }
        }
    } else {
        const widthRoundedUp = Math.ceil(width / 8) * 8;
        let index = 0, widthCounter = 0;
        for (const token of tokens) {
            let bin = hexToBinary(token);
            if (bin === null) throw new Error(`Invalid token: ${token}`);
            if (bin.length === 4) bin += "0000";
            for (const bit of bin) {
                if (widthCounter >= widthRoundedUp) widthCounter = 0;
                if (widthCounter < width) {
                    const x = index % width;
                    const y = Math.floor(index / width);
                    setPixel(x, y, bit === "1");
                    index++;
                }
                widthCounter++;
            }
        }
    }
    return imageData;
}

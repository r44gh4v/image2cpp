const assert = require("assert");
const Generator = require("../js/generator.js");

// 1. Bit-swap reverses bit order within each byte (mono horizontal).
{
    const settings = {
        varName: "swp", drawMode: "horizontal", outputFormat: "plain",
        pixelFormat: "mono1", bitSwap: true, width: 8, height: 1,
    };
    // 1000_0000 = 0x80 -> reversed -> 0000_0001 = 0x01
    const binaryData = Uint8Array.from([1, 0, 0, 0, 0, 0, 0, 0]);
    const output = Generator.generateFrame(binaryData, settings, "");
    assert.ok(output.includes("0x01"));
    assert.ok(!output.includes("0x80"));
}

// 2. RGB565 uses uint16_t and 4-digit hex tokens.
{
    const settings = {
        varName: "col565", outputFormat: "arduino",
        pixelFormat: "rgb565", width: 2, height: 1,
    };
    const data = Uint16Array.from([0xF800, 0x07E0]);
    const output = Generator.generateFrame(data, settings, "");
    assert.ok(output.includes("const uint16_t col565 [] PROGMEM = {"));
    assert.ok(output.includes("0xF800, 0x07E0"));
}

// 3. RGB888 uses unsigned long and 8-digit hex tokens.
{
    const settings = {
        varName: "col888", outputFormat: "plain",
        pixelFormat: "rgb888", width: 2, height: 1,
    };
    const data = Uint32Array.from([0x123456, 0xFFFFFF]);
    const output = Generator.generateFrame(data, settings, "");
    assert.ok(output.includes("const unsigned long col888 [] = {"));
    assert.ok(output.includes("0x00123456, 0x00FFFFFF"));
}

// 4. Alpha map packs like horizontal mono (unsigned char).
{
    const settings = {
        varName: "amask", outputFormat: "plain",
        pixelFormat: "alpha", width: 8, height: 1,
    };
    const binaryData = Uint8Array.from([1, 1, 1, 1, 0, 0, 0, 0]);
    const output = Generator.generateFrame(binaryData, settings, "");
    assert.ok(output.includes("const unsigned char amask [] = {"));
    assert.ok(output.includes("0xF0")); // 1111_0000
}

// 5. Single static image (mono) always gets the convenience array.
{
    const originalDocument = global.document;
    const originalProcessor = global.Processor;
    try {
        global.document = { createElement() { return { width: 0, height: 0 }; } };
        global.Processor = {
            sourceIsGif: false,
            sourceImage: { kind: "src" },
            gifFrames: [],
            processFrame() { return { binaryData: new Uint8Array(8) }; },
        };
        const output = Generator.generate({
            width: 8, height: 1, drawMode: "horizontal", outputFormat: "arduino",
            pixelFormat: "mono1", varName: "solo",
        });
        assert.ok(output.includes("const int soloallArray_LEN = 1;"));
        assert.ok(output.includes("const unsigned char* soloallArray[1] = {"));
        assert.ok(output.includes("\tsolo\n};"));
    } finally {
        if (typeof originalDocument === "undefined") delete global.document; else global.document = originalDocument;
        if (typeof originalProcessor === "undefined") delete global.Processor; else global.Processor = originalProcessor;
    }
}

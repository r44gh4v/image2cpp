const assert = require("assert");
const Processor = require("../js/processor.js");

// Helper: opaque RGBA pixel row
function rgba(values) {
    return { data: new Uint8ClampedArray(values) };
}

// 1. mono1 binary: bright > threshold -> lit(1); dark -> 0 (WYSIWYG)
{
    const img = rgba([
        255, 255, 255, 255,   // white -> lit
        0, 0, 0, 255,         // black -> off
        200, 200, 200, 255,   // bright -> lit
        50, 50, 50, 255,      // dark -> off
    ]);
    const result = Processor.applyFiltersAndColorMap(img, 2, 2, {
        pixelFormat: "mono1", dither: "binary", threshold: 128, contrast: 0,
        invert: false, invertBg: false, theme: "oled-white", drawMode: "horizontal",
    });
    assert.deepStrictEqual(Array.from(result.binaryData), [1, 0, 1, 0]);
    assert.strictEqual(result.rgb565Data, null);
    assert.strictEqual(result.rgb888Data, null);
}

// 2. Threshold direction: higher threshold -> fewer lit
{
    const make = () => rgba([100, 100, 100, 255]); // mid-grey
    const low = Processor.applyFiltersAndColorMap(make(), 1, 1, {
        pixelFormat: "mono1", dither: "binary", threshold: 50, contrast: 0,
        invert: false, invertBg: false, theme: "oled-white",
    });
    const high = Processor.applyFiltersAndColorMap(make(), 1, 1, {
        pixelFormat: "mono1", dither: "binary", threshold: 200, contrast: 0,
        invert: false, invertBg: false, theme: "oled-white",
    });
    assert.strictEqual(low.binaryData[0], 1);  // 100 >= 50 -> lit
    assert.strictEqual(high.binaryData[0], 0); // 100 < 200 -> off
}

// 3. Dither methods all return 0/255-derived bits of correct length
{
    ["binary", "bayer", "floydsteinberg", "atkinson"].forEach((method) => {
        const data = [];
        for (let i = 0; i < 16; i += 1) data.push(i * 16, i * 16, i * 16, 255);
        const result = Processor.applyFiltersAndColorMap(rgba(data), 4, 4, {
            pixelFormat: "mono1", dither: method, threshold: 128, contrast: 0,
            invert: false, invertBg: false, theme: "oled-white", drawMode: "horizontal",
        });
        assert.strictEqual(result.binaryData.length, 16, `length for ${method}`);
        for (const bit of result.binaryData) {
            assert.ok(bit === 0 || bit === 1, `bit value for ${method}`);
        }
    });
}

// 4. RGB565 packing: pure red -> 0xF800, pure green -> 0x07E0, pure blue -> 0x001F
{
    const img = rgba([
        255, 0, 0, 255,
        0, 255, 0, 255,
        0, 0, 255, 255,
        255, 255, 255, 255,
    ]);
    const result = Processor.applyFiltersAndColorMap(img, 4, 1, {
        pixelFormat: "rgb565", contrast: 0, invert: false, theme: "oled-white",
    });
    assert.strictEqual(result.binaryData, null);
    assert.strictEqual(result.rgb565Data.length, 4);
    assert.strictEqual(result.rgb565Data[0], 0xF800);
    assert.strictEqual(result.rgb565Data[1], 0x07E0);
    assert.strictEqual(result.rgb565Data[2], 0x001F);
    assert.strictEqual(result.rgb565Data[3], 0xFFFF);
}

// 5. RGB888 packing: r<<16 | g<<8 | b
{
    const img = rgba([
        0x12, 0x34, 0x56, 255,
        255, 255, 255, 255,
    ]);
    const result = Processor.applyFiltersAndColorMap(img, 2, 1, {
        pixelFormat: "rgb888", contrast: 0, invert: false, theme: "oled-white",
    });
    assert.strictEqual(result.rgb888Data.length, 2);
    assert.strictEqual(result.rgb888Data[0], 0x123456);
    assert.strictEqual(result.rgb888Data[1], 0xFFFFFF);
}

// 6. Alpha map: alpha > threshold -> lit; honours invert
{
    const img = rgba([
        0, 0, 0, 255,     // opaque -> lit
        0, 0, 0, 10,      // transparent -> off
        0, 0, 0, 200,     // opaque -> lit
        0, 0, 0, 0,       // transparent -> off
    ]);
    const result = Processor.applyFiltersAndColorMap(img, 2, 2, {
        pixelFormat: "alpha", threshold: 128, invert: false, theme: "oled-white",
    });
    assert.deepStrictEqual(Array.from(result.binaryData), [1, 0, 1, 0]);

    const inverted = Processor.applyFiltersAndColorMap(rgba([
        0, 0, 0, 255,
        0, 0, 0, 0,
    ]), 2, 1, { pixelFormat: "alpha", threshold: 128, invert: true, theme: "oled-white" });
    assert.deepStrictEqual(Array.from(inverted.binaryData), [0, 1]);
}

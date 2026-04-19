const assert = require("assert");
const Generator = require("../js/generator.js");

{
    const settings = {
        varName: "img_horizontal",
        drawMode: "horizontal",
        outputFormat: "plain",
        width: 8,
        height: 1,
    };

    const binaryData = Uint8Array.from([1, 0, 1, 0, 1, 0, 1, 0]);
    const output = Generator.generateFrame(binaryData, settings, "");

    assert.ok(output.includes("const unsigned char img_horizontal[]"));
    assert.ok(output.includes("0xAA"));
}

{
    const settings = {
        varName: "img_vertical",
        drawMode: "vertical",
        outputFormat: "arduino",
        width: 1,
        height: 8,
    };

    const binaryData = Uint8Array.from([1, 0, 1, 0, 1, 0, 1, 0]);
    const output = Generator.generateFrame(binaryData, settings, "");

    assert.ok(output.includes("const unsigned char PROGMEM img_vertical[]"));
    assert.ok(output.includes("0x55"));
}

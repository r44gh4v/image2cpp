const assert = require("assert");
const Generator = require("../js/generator.js");

{
    const binaryData = new Uint8Array(64);
    for (let x = 0; x < 8; x += 1) {
        binaryData[x] = 1;
    }

    const output = Generator.generateFrame(binaryData, {
        varName: "9 bad",
        drawMode: "not-a-mode",
        outputFormat: "plain",
        width: "8",
        height: "8",
    });

    assert.ok(output.includes("const unsigned char _9_bad[]"));
    assert.ok(output.includes("0x01, 0x01, 0x01, 0x01"));
}

{
    assert.throws(() => {
        Generator.generateFrame(new Uint8Array(8), {
            varName: "img",
            drawMode: "vertical",
            outputFormat: "plain",
            width: 8,
            height: 8,
        });
    }, /expected at least 64 pixels/);
}

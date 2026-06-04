const assert = require("assert");
const settings = require("../js/core/settings.js");

{
    const result = settings.sanitizeVarName(" 9-my icon ");
    assert.strictEqual(result, "_9_my_icon");
}

{
    const result = settings.sanitizeVarName("***");
    assert.strictEqual(result, "byte array");
}

{
    const normalized = settings.normalizeSettings({
        width: "99999",
        height: "0",
        threshold: "400",
        contrast: "-500",
        rotate: 271,
        drawMode: "unknown",
        outputFormat: "plain",
        varName: "1-logo",
    });

    assert.strictEqual(normalized.width, 8192);
    assert.strictEqual(normalized.height, 1);
    assert.strictEqual(normalized.threshold, 255);
    assert.strictEqual(normalized.contrast, -255);
    assert.strictEqual(normalized.rotate, 270);
    assert.strictEqual(normalized.pixelFormat, "mono1");
    assert.strictEqual(normalized.dither, "binary");
    assert.strictEqual(normalized.bitSwap, false);
    assert.strictEqual(normalized.drawMode, "horizontal");
    assert.strictEqual(normalized.outputFormat, "plain");
    assert.strictEqual(normalized.varName, "_1_logo");
    assert.strictEqual(normalized.processingMethod, undefined);
}

{
    const normalized = settings.normalizeSettings({ dither: "atkinson" });
    assert.strictEqual(normalized.dither, "atkinson");
}

{
    const normalized = settings.normalizeSettings({ dither: "nope" });
    assert.strictEqual(normalized.dither, "binary");
}

{
    // Non-mono pixel formats force horizontal orientation and ignore bitSwap for color.
    const f565 = settings.normalizeSettings({ pixelFormat: "rgb565", drawMode: "vertical", bitSwap: true });
    assert.strictEqual(f565.pixelFormat, "rgb565");
    assert.strictEqual(f565.drawMode, "horizontal");
    assert.strictEqual(f565.bitSwap, false);

    const f888 = settings.normalizeSettings({ pixelFormat: "rgb888", drawMode: "vertical" });
    assert.strictEqual(f888.pixelFormat, "rgb888");
    assert.strictEqual(f888.drawMode, "horizontal");

    const alpha = settings.normalizeSettings({ pixelFormat: "alpha", drawMode: "vertical", bitSwap: "true" });
    assert.strictEqual(alpha.pixelFormat, "alpha");
    assert.strictEqual(alpha.drawMode, "horizontal");
    assert.strictEqual(alpha.bitSwap, true);

    const badFormat = settings.normalizeSettings({ pixelFormat: "wat" });
    assert.strictEqual(badFormat.pixelFormat, "mono1");
}

{
    // mono1 keeps vertical when explicitly chosen and honours bitSwap.
    const mono = settings.normalizeSettings({ pixelFormat: "mono1", drawMode: "vertical", bitSwap: "1" });
    assert.strictEqual(mono.drawMode, "vertical");
    assert.strictEqual(mono.bitSwap, true);
}

{
    const merged = settings.mergeFrameTuning(
        { width: 96, height: 64, varName: "frame_a" },
        { contrast: "40", threshold: "12", invertBg: "false" },
    );

    assert.strictEqual(merged.width, 96);
    assert.strictEqual(merged.height, 64);
    assert.strictEqual(merged.contrast, 40);
    assert.strictEqual(merged.threshold, 12);
    assert.strictEqual(merged.invertBg, false);
}

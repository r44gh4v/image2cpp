const assert = require("assert");
const settings = require("../js/core/settings.js");

{
    const result = settings.sanitizeVarName(" 9-my icon ");
    assert.strictEqual(result, "9_my_icon".replace(/^9/, "_9"));
}

{
    const result = settings.sanitizeVarName("***");
    assert.strictEqual(result, "bitmap");
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
    assert.strictEqual(normalized.processingMethod, "threshold");
    assert.strictEqual(normalized.dither, false);
    assert.strictEqual(normalized.drawMode, "vertical");
    assert.strictEqual(normalized.outputFormat, "plain");
    assert.strictEqual(normalized.varName, "_1_logo");
}

{
    const normalized = settings.normalizeSettings({ dither: "false" });

    assert.strictEqual(normalized.processingMethod, "threshold");
    assert.strictEqual(normalized.dither, false);
}

{
    const normalized = settings.normalizeSettings({ dither: "true" });

    assert.strictEqual(normalized.processingMethod, "threshold");
    assert.strictEqual(normalized.dither, false);
}

{
    const normalized = settings.normalizeSettings({ processingMethod: "atkinson" });

    assert.strictEqual(normalized.processingMethod, "threshold");
    assert.strictEqual(normalized.dither, false);
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

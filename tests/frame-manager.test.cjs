const assert = require("assert");
require("../js/core/settings.js");
const frameManager = require("../js/core/frame-manager.js");

{
    const frame = { delay: 12 };
    const tuning = frameManager.readFrameTuning(frame);

    assert.strictEqual(typeof tuning, "object");
    assert.strictEqual(tuning.contrast, 0);
    assert.strictEqual(tuning.threshold, 128);
    assert.strictEqual(tuning.invert, false);
    assert.strictEqual(tuning.invertBg, false);
    assert.strictEqual(tuning.processingMethod, undefined);
    assert.strictEqual(tuning.dither, undefined);
}

{
    const frame = { delay: 5, tuning: { contrast: 20 } };
    frameManager.applyUiTuningToFrame(frame, {
        threshold: "220",
        invert: true,
        invertBg: false,
    });

    assert.strictEqual(frame.tuning.contrast, 20);
    assert.strictEqual(frame.tuning.threshold, 220);
    assert.strictEqual(frame.tuning.invert, true);
    assert.strictEqual(frame.tuning.invertBg, false);
    // dither / processingMethod are global settings now, not per-frame tuning.
    assert.strictEqual(frame.tuning.processingMethod, undefined);
    assert.strictEqual(frame.tuning.dither, undefined);
}

{
    const frames = [{}, {}, {}];
    frameManager.applyUiTuningToFrames(frames, { contrast: "90" });

    for (const frame of frames) {
        assert.strictEqual(frame.tuning.contrast, 90);
    }
}

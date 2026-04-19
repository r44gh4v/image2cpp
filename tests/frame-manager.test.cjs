const assert = require("assert");
require("../js/core/settings.js");
const frameManager = require("../js/core/frame-manager.js");

{
    const frame = { delay: 12 };
    const tuning = frameManager.readFrameTuning(frame);

    assert.strictEqual(typeof tuning, "object");
    assert.strictEqual(tuning.contrast, 0);
    assert.strictEqual(tuning.threshold, 128);
    assert.strictEqual(tuning.invertBg, true);
}

{
    const frame = { delay: 5, tuning: { contrast: 20 } };
    frameManager.applyUiTuningToFrame(frame, {
        threshold: "220",
        dither: true,
        invert: true,
        invertBg: false,
    });

    assert.strictEqual(frame.tuning.contrast, 20);
    assert.strictEqual(frame.tuning.threshold, 220);
    assert.strictEqual(frame.tuning.dither, true);
    assert.strictEqual(frame.tuning.invert, true);
    assert.strictEqual(frame.tuning.invertBg, false);
}

{
    const frames = [{}, {}, {}];
    frameManager.applyUiTuningToFrames(frames, { contrast: "90" });

    for (const frame of frames) {
        assert.strictEqual(frame.tuning.contrast, 90);
    }
}

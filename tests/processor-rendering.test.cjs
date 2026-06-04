const assert = require("assert");
const Processor = require("../js/processor.js");

function makeCtx() {
    return {
        imageSmoothingEnabled: undefined,
        drawArgs: null,
        clearRect() {},
        save() {},
        translate() {},
        rotate() {},
        scale() {},
        drawImage(/* source */ _s, dx, dy, dw, dh) {
            this.drawArgs = { dx, dy, dw, dh };
        },
        restore() {},
        putImageData() {},
        getImageData() {
            return { data: new Uint8ClampedArray(8 * 8 * 4) };
        },
    };
}

function runProcess(ctx, extraSettings) {
    const original = Processor.sourceImage;
    try {
        Processor.sourceImage = { width: 4, height: 4 };
        const canvas = { width: 8, height: 8, getContext() { return ctx; } };
        Processor.processFrame(canvas, { id: "src" }, Object.assign({
            width: 8,
            height: 8,
            scale: "fit",
            pixelFormat: "mono1",
            varName: "x",
            outputFormat: "plain",
        }, extraSettings || {}));
    } finally {
        Processor.sourceImage = original;
    }
}

// Default: smooth scaling ON (matches javl) so dithering can recover detail.
{
    const ctx = makeCtx();
    runProcess(ctx, {});
    assert.strictEqual(ctx.imageSmoothingEnabled, true);

    // Draw rect is snapped to whole pixels (no sub-pixel smear) in either mode.
    assert.ok(ctx.drawArgs, "drawImage should have been called");
    assert.strictEqual(ctx.drawArgs.dw, Math.round(ctx.drawArgs.dw));
    assert.strictEqual(ctx.drawArgs.dh, Math.round(ctx.drawArgs.dh));
    assert.strictEqual(ctx.drawArgs.dx, Math.round(ctx.drawArgs.dx));
    assert.strictEqual(ctx.drawArgs.dy, Math.round(ctx.drawArgs.dy));
}

// Smooth scaling OFF -> nearest-neighbour (pixel-perfect crisp art).
{
    const ctx = makeCtx();
    runProcess(ctx, { smoothScaling: false });
    assert.strictEqual(ctx.imageSmoothingEnabled, false);
}

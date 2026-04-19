const assert = require("assert");
const previewServiceFactory = require("../js/core/preview-service.js");

function classList(initial) {
    const names = new Set(initial || []);
    return {
        toggle(name, force) {
            if (force === true) {
                names.add(name);
                return true;
            }
            if (force === false) {
                names.delete(name);
                return false;
            }
            if (names.has(name)) {
                names.delete(name);
                return false;
            }
            names.add(name);
            return true;
        },
        contains(name) {
            return names.has(name);
        },
    };
}

const processorCalls = [];
const service = previewServiceFactory.create({
    processor: {
        processFrame(canvas, source, settings) {
            processorCalls.push({ canvas, source, settings });
            return { ok: true };
        },
    },
});

{
    const buttons = [
        { dataset: { preset: "128x64" }, classList: classList() },
        { dataset: { preset: "96x64" }, classList: classList(["active"]) },
    ];

    service.setPresetActiveButtons(buttons, 128, 64);

    assert.strictEqual(buttons[0].classList.contains("active"), true);
    assert.strictEqual(buttons[1].classList.contains("active"), false);
}

{
    const canvas = { width: 0, height: 0, classList: classList() };
    const timeline = { classList: classList(["is-hidden"]) };

    service.syncPreviewSurface(canvas, timeline, true, 200, 100);

    assert.strictEqual(canvas.width, 200);
    assert.strictEqual(canvas.height, 100);
    assert.strictEqual(canvas.classList.contains("is-gif"), true);
    assert.strictEqual(timeline.classList.contains("is-hidden"), false);
}

{
    const timeline = {
        children: [
            { classList: classList(["active"]) },
            { classList: classList() },
            { classList: classList() },
        ],
    };

    service.setTimelineActive(timeline, 2);

    assert.strictEqual(timeline.children[0].classList.contains("active"), false);
    assert.strictEqual(timeline.children[1].classList.contains("active"), false);
    assert.strictEqual(timeline.children[2].classList.contains("active"), true);
}

{
    const response = service.renderToCanvas({ id: "canvas" }, { id: "frame" }, { theme: "oled-white" });
    assert.deepStrictEqual(response, { ok: true });
    assert.strictEqual(processorCalls.length, 1);
}

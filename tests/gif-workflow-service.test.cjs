const assert = require("assert");
require("../js/core/settings.js");
const frameManager = require("../js/core/frame-manager.js");
const gifWorkflowFactory = require("../js/core/gif-workflow-service.js");

function classList(initial) {
    const classes = new Set(initial || []);
    return {
        toggle(name, force) {
            if (force === true) {
                classes.add(name);
                return true;
            }
            if (force === false) {
                classes.delete(name);
                return false;
            }
            if (classes.has(name)) {
                classes.delete(name);
                return false;
            }
            classes.add(name);
            return true;
        },
        contains(name) {
            return classes.has(name);
        },
    };
}

const service = gifWorkflowFactory.create({ frameTuningManager: frameManager });

{
    const frames = [{}, {}];
    service.applyUiTuning({
        frames,
        isPaused: true,
        currentFrame: 1,
        uiTuning: { contrast: 120, threshold: 20 },
    });

    assert.strictEqual(typeof frames[0].tuning, "undefined");
    assert.strictEqual(frames[1].tuning.contrast, 120);
    assert.strictEqual(frames[1].tuning.threshold, 20);
}

{
    const frames = [{}, {}];
    service.applyUiTuning({
        frames,
        isPaused: false,
        uiTuning: { contrast: 50 },
    });

    assert.strictEqual(frames[0].tuning.contrast, 50);
    assert.strictEqual(frames[1].tuning.contrast, 50);
}

{
    const timeline = { children: [] };
    const currentSettings = { width: 128, height: 64, scale: "fit" };

    assert.strictEqual(
        service.needsTimelineRebuild({
            timeline,
            currentSettings,
            lastW: 128,
            lastH: 64,
            lastScale: "fit",
        }),
        true,
    );

    timeline.children = [1];

    assert.strictEqual(
        service.needsTimelineRebuild({
            timeline,
            currentSettings,
            lastW: 128,
            lastH: 64,
            lastScale: "fit",
        }),
        false,
    );
}

{
    const rendered = [];
    const timeline = {
        children: [
            { querySelector: () => ({ id: "anim" }) },
            { querySelector: () => ({ id: "thumb-0" }) },
        ],
    };
    const frames = [{ imgData: { id: "frame-0" } }];

    const ok = service.renderSingleThumbnail({
        timeline,
        frames,
        index: 0,
        getSettings: () => ({ width: 8, height: 8 }),
        renderToCanvas(canvas, source, settings) {
            rendered.push({ canvas, source, settings });
        },
    });

    assert.strictEqual(ok, true);
    assert.strictEqual(rendered.length, 1);
    assert.strictEqual(rendered[0].canvas.id, "thumb-0");
    assert.strictEqual(rendered[0].source.id, "frame-0");
}

{
    const appState = {
        gifTimer: 10,
        currentFrame: 0,
        isPaused: false,
    };

    const processor = {
        sourceIsGif: true,
        gifFrames: [
            { imgData: { id: "f0" }, delay: 5 },
            { imgData: { id: "f1" }, delay: 5 },
        ],
    };

    const renderCalls = [];
    const activeCalls = [];
    const setCalls = [];
    const cleared = [];
    const scheduled = [];
    const previewInfo = { textContent: "" };

    service.startPlayback({
        appState,
        setStateValue(key, value) {
            appState[key] = value;
            setCalls.push({ key, value });
        },
        processor,
        getSettings() {
            return { width: 8, height: 8 };
        },
        renderToCanvas(canvas, source, settings) {
            renderCalls.push({ canvas, source, settings });
        },
        previewCanvas: { id: "preview" },
        previewInfo,
        setActiveTimelineEntry(index) {
            activeCalls.push(index);
        },
        clearFn(timerId) {
            cleared.push(timerId);
        },
        scheduleFn(fn, delay) {
            scheduled.push({ fn, delay });
            return 99;
        },
    });

    assert.deepStrictEqual(cleared, [10]);
    assert.strictEqual(renderCalls.length, 1);
    assert.strictEqual(renderCalls[0].source.id, "f0");
    assert.deepStrictEqual(activeCalls, [0]);
    assert.strictEqual(appState.currentFrame, 0);
    assert.strictEqual(appState.gifTimer, 99);
    assert.strictEqual(scheduled.length, 1);
    assert.strictEqual(scheduled[0].delay, 50);
    assert.ok(previewInfo.textContent.includes("GIF: 1/2 fr"));
}

{
    const appState = {
        gifTimer: null,
        currentFrame: 1,
        isPaused: true,
    };

    const processor = {
        sourceIsGif: true,
        gifFrames: [
            { imgData: { id: "f0" }, delay: 5 },
            { imgData: { id: "f1" }, delay: 5 },
        ],
    };

    const scheduled = [];
    const previewInfo = { textContent: "" };

    service.startPlayback({
        appState,
        setStateValue(key, value) {
            appState[key] = value;
        },
        processor,
        getSettings() {
            return { width: 8, height: 8 };
        },
        renderToCanvas() {
            throw new Error("renderToCanvas should not be called while paused on first tick.");
        },
        previewCanvas: { id: "preview" },
        previewInfo,
        scheduleFn(fn, delay) {
            scheduled.push({ fn, delay });
            return 77;
        },
    });

    assert.strictEqual(scheduled.length, 0);
    assert.strictEqual(appState.gifTimer, null);
    assert.ok(previewInfo.textContent.includes("(Paused)"));
}

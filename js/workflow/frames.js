import { normalizeFrameTuning } from "../core/settings.js";

let frames = [];
let activeIndex = 0;
let nextId = 1;

export function getFrames() { return frames; }
export function getActiveIndex() { return activeIndex; }
export function setActiveIndex(i) {
    if (frames.length === 0) { activeIndex = 0; return; }
    activeIndex = ((i % frames.length) + frames.length) % frames.length;
}
export function isMultiFrame() { return frames.length > 1; }
export function hasFrames() { return frames.length > 0; }

export function setFrames(list) {
    frames = (list || []).map((f) => ({
        id: f.id || `f${nextId++}`,
        source: f.source,
        name: f.name || "frame",
        delayMs: Number.isFinite(f.delayMs) ? f.delayMs : 0,
        tuning: f.tuning || null,
    }));
    activeIndex = 0;
    return frames;
}

function ensureFrame(frame) {
    if (!frame || typeof frame !== "object") {
        return null;
    }

    if (!frame.tuning || typeof frame.tuning !== "object") {
        frame.tuning = {};
    }

    frame.tuning = normalizeFrameTuning(frame.tuning);
    return frame;
}

export function readFrameTuning(frame) {
    const target = ensureFrame(frame);
    if (!target) {
        return normalizeFrameTuning();
    }

    return normalizeFrameTuning(target.tuning);
}

export function applyUiTuningToFrame(frame, uiTuning) {
    const target = ensureFrame(frame);
    if (!target) {
        return null;
    }

    const incoming = uiTuning || {};
    const merged = Object.assign({}, target.tuning, incoming);

    target.tuning = normalizeFrameTuning(merged);
    return target.tuning;
}

export function applyUiTuningToFrames(frames, uiTuning) {
    if (!Array.isArray(frames)) {
        return;
    }

    for (const frame of frames) {
        applyUiTuningToFrame(frame, uiTuning);
    }
}

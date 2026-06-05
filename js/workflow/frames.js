import { normalizeFrameTuning } from "../core/settings.js";

let frames = [];
let nextId = 1;

export function getFrames() { return frames; }
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

export function applyUiTuningToFrames(frameList, uiTuning) {
    if (!Array.isArray(frameList)) {
        return;
    }

    for (const frame of frameList) {
        applyUiTuningToFrame(frame, uiTuning);
    }
}

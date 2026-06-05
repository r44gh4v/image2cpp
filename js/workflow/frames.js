import { normalizeFrameTuning } from "../core/settings.js";

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

(function initImage2CppFrameManager(root) {
    const settingsApi = root.Image2CppSettings;

    function normalizeTuning(rawTuning) {
        if (settingsApi && typeof settingsApi.normalizeFrameTuning === "function") {
            return settingsApi.normalizeFrameTuning(rawTuning);
        }

        const source = rawTuning || {};

        return {
            contrast: Number.isFinite(Number(source.contrast)) ? Number(source.contrast) : 0,
            threshold: Number.isFinite(Number(source.threshold)) ? Number(source.threshold) : 128,
            processingMethod: "threshold",
            dither: false,
            invert: Boolean(source.invert),
            invertBg: source.invertBg === true,
        };
    }

    function ensureFrame(frame) {
        if (!frame || typeof frame !== "object") {
            return null;
        }

        if (!frame.tuning || typeof frame.tuning !== "object") {
            frame.tuning = {};
        }

        frame.tuning = normalizeTuning(frame.tuning);
        return frame;
    }

    function readFrameTuning(frame) {
        const target = ensureFrame(frame);
        if (!target) {
            return normalizeTuning();
        }

        return normalizeTuning(target.tuning);
    }

    function applyUiTuningToFrame(frame, uiTuning) {
        const target = ensureFrame(frame);
        if (!target) {
            return null;
        }

        const incoming = uiTuning || {};
        const merged = Object.assign({}, target.tuning, incoming);

        if (
            Object.prototype.hasOwnProperty.call(incoming, "dither")
            && !Object.prototype.hasOwnProperty.call(incoming, "processingMethod")
        ) {
            delete merged.processingMethod;
        }

        target.tuning = normalizeTuning(merged);
        return target.tuning;
    }

    function applyUiTuningToFrames(frames, uiTuning) {
        if (!Array.isArray(frames)) {
            return;
        }

        for (const frame of frames) {
            applyUiTuningToFrame(frame, uiTuning);
        }
    }

    const api = {
        readFrameTuning,
        applyUiTuningToFrame,
        applyUiTuningToFrames,
    };

    if (typeof module !== "undefined" && module.exports) {
        module.exports = api;
    }

    root.Image2CppFrameManager = api;
})(typeof globalThis !== "undefined" ? globalThis : this);

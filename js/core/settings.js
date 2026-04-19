(function initImage2CppSettings(root) {
    const constants = root.Image2CppConstants || {};

    const defaultSettings = constants.DEFAULT_SETTINGS || {
        width: 128,
        height: 64,
        scale: "fit",
        contrast: 0,
        threshold: 128,
        processingMethod: "threshold",
        dither: false,
        invert: false,
        invertBg: false,
        flipH: false,
        flipV: false,
        rotate: 0,
        outputFormat: "arduino",
        drawMode: "vertical",
        varName: "bitmap",
        theme: "oled-white",
    };

    const limits = constants.LIMITS || {
        width: { min: 1, max: 8192 },
        height: { min: 1, max: 8192 },
        contrast: { min: -255, max: 255 },
        threshold: { min: 0, max: 255 },
        rotateStep: 90,
    };

    const allowedValues = constants.ALLOWED_VALUES || {
        scale: ["fit", "stretch", "original"],
        processingMethod: ["threshold"],
        outputFormat: ["arduino", "plain"],
        drawMode: ["vertical", "horizontal"],
        theme: ["oled-white", "oled-blue", "oled-yellow", "lcd-green"],
    };

    function toInteger(value, fallback) {
        const numeric = Number(value);
        if (!Number.isFinite(numeric)) {
            return fallback;
        }
        return Math.trunc(numeric);
    }

    function clampInteger(value, min, max, fallback) {
        const numeric = toInteger(value, fallback);
        if (numeric < min) {
            return min;
        }
        if (numeric > max) {
            return max;
        }
        return numeric;
    }

    function toBoolean(value, fallback) {
        if (typeof value === "boolean") {
            return value;
        }

        if (typeof value === "string") {
            const normalized = value.trim().toLowerCase();
            if (normalized === "true" || normalized === "1") {
                return true;
            }
            if (normalized === "false" || normalized === "0") {
                return false;
            }
        }

        if (typeof value === "number") {
            return value !== 0;
        }

        return fallback;
    }

    function oneOf(value, list, fallback) {
        if (list.includes(value)) {
            return value;
        }
        return fallback;
    }

    function normalizeProcessingMethod(value) {
        return oneOf(value, allowedValues.processingMethod, defaultSettings.processingMethod);
    }

    function normalizeRotate(value) {
        const step = limits.rotateStep || 90;
        const raw = toInteger(value, defaultSettings.rotate || 0);
        const snapped = Math.round(raw / step) * step;
        const normalized = ((snapped % 360) + 360) % 360;
        return normalized;
    }

    function sanitizeVarName(rawName, fallback) {
        const safeFallback = typeof fallback === "string" && fallback.length > 0
            ? fallback
            : defaultSettings.varName;
        const source = typeof rawName === "string" ? rawName.trim() : "";
        const replaced = source.replace(/[^a-zA-Z0-9_]/g, "_");
        const prefixed = replaced.replace(/^[0-9]/, "_$&");
        const collapsed = prefixed.replace(/_+/g, "_").replace(/_+$/g, "");
        return collapsed || safeFallback;
    }

    function normalizeFrameTuning(rawTuning) {
        const source = rawTuning || {};
        const processingMethod = normalizeProcessingMethod(source.processingMethod);

        return {
            contrast: clampInteger(
                source.contrast,
                limits.contrast.min,
                limits.contrast.max,
                defaultSettings.contrast,
            ),
            threshold: clampInteger(
                source.threshold,
                limits.threshold.min,
                limits.threshold.max,
                defaultSettings.threshold,
            ),
            processingMethod,
            dither: false,
            invert: toBoolean(source.invert, defaultSettings.invert),
            invertBg: toBoolean(source.invertBg, defaultSettings.invertBg),
        };
    }

    function normalizeSettings(rawSettings) {
        const source = rawSettings || {};
        const tuning = normalizeFrameTuning(source);

        return {
            width: clampInteger(source.width, limits.width.min, limits.width.max, defaultSettings.width),
            height: clampInteger(source.height, limits.height.min, limits.height.max, defaultSettings.height),
            scale: oneOf(source.scale, allowedValues.scale, defaultSettings.scale),
            contrast: tuning.contrast,
            threshold: tuning.threshold,
            processingMethod: tuning.processingMethod,
            dither: tuning.dither,
            invert: tuning.invert,
            invertBg: tuning.invertBg,
            flipH: toBoolean(source.flipH, defaultSettings.flipH),
            flipV: toBoolean(source.flipV, defaultSettings.flipV),
            rotate: normalizeRotate(source.rotate),
            outputFormat: oneOf(source.outputFormat, allowedValues.outputFormat, defaultSettings.outputFormat),
            drawMode: oneOf(source.drawMode, allowedValues.drawMode, defaultSettings.drawMode),
            varName: sanitizeVarName(source.varName, defaultSettings.varName),
            theme: oneOf(source.theme, allowedValues.theme, defaultSettings.theme),
        };
    }

    function mergeFrameTuning(baseSettings, rawTuning) {
        return normalizeSettings(Object.assign({}, baseSettings || {}, normalizeFrameTuning(rawTuning)));
    }

    const api = {
        sanitizeVarName,
        normalizeFrameTuning,
        normalizeSettings,
        mergeFrameTuning,
    };

    if (typeof module !== "undefined" && module.exports) {
        module.exports = api;
    }

    root.Image2CppSettings = api;
})(typeof globalThis !== "undefined" ? globalThis : this);

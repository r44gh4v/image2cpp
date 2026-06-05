import {
    DEFAULT_SETTINGS as defaultSettings,
    LIMITS as limits,
    ALLOWED_VALUES as allowedValues,
} from "./constants.js";

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

function normalizeRotate(value) {
    const step = limits.rotateStep || 90;
    const raw = toInteger(value, defaultSettings.rotate || 0);
    const snapped = Math.round(raw / step) * step;
    const normalized = ((snapped % 360) + 360) % 360;
    return normalized;
}

export function sanitizeVarName(rawName, fallback) {
    const safeFallback = typeof fallback === "string" && fallback.length > 0
        ? fallback
        : defaultSettings.varName;
    const source = typeof rawName === "string" ? rawName.trim() : "";
    const replaced = source.replace(/[^a-zA-Z0-9_]/g, "_");
    const prefixed = replaced.replace(/^[0-9]/, "_$&");
    const collapsed = prefixed.replace(/_+/g, "_").replace(/_+$/g, "");
    return collapsed || safeFallback;
}

export function normalizeFrameTuning(rawTuning) {
    const source = rawTuning || {};

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
        invert: toBoolean(source.invert, defaultSettings.invert),
        invertBg: toBoolean(source.invertBg, defaultSettings.invertBg),
    };
}

export function normalizeSettings(rawSettings) {
    const source = rawSettings || {};
    const tuning = normalizeFrameTuning(source);

    const pixelFormat = oneOf(source.pixelFormat, allowedValues.pixelFormat, defaultSettings.pixelFormat);
    let drawMode = oneOf(source.drawMode, allowedValues.drawMode, defaultSettings.drawMode);
    if (pixelFormat !== "mono1") {
        drawMode = "horizontal";
    }
    const supportsBitSwap = pixelFormat === "mono1" || pixelFormat === "alpha";
    const bitSwap = supportsBitSwap
        ? toBoolean(source.bitSwap, defaultSettings.bitSwap)
        : false;

    return {
        width: clampInteger(source.width, limits.width.min, limits.width.max, defaultSettings.width),
        height: clampInteger(source.height, limits.height.min, limits.height.max, defaultSettings.height),
        scale: oneOf(source.scale, allowedValues.scale, defaultSettings.scale),
        contrast: tuning.contrast,
        threshold: tuning.threshold,
        dither: oneOf(source.dither, allowedValues.dither, defaultSettings.dither),
        pixelFormat: pixelFormat,
        invert: tuning.invert,
        invertBg: tuning.invertBg,
        flipH: toBoolean(source.flipH, defaultSettings.flipH),
        flipV: toBoolean(source.flipV, defaultSettings.flipV),
        rotate: normalizeRotate(source.rotate),
        outputFormat: oneOf(source.outputFormat, allowedValues.outputFormat, defaultSettings.outputFormat),
        drawMode: drawMode,
        bitSwap: bitSwap,
        smoothScaling: toBoolean(source.smoothScaling, defaultSettings.smoothScaling),
        varName: sanitizeVarName(source.varName, defaultSettings.varName),
        theme: oneOf(source.theme, allowedValues.theme, defaultSettings.theme),
        firstAsciiChar: clampInteger(source.firstAsciiChar, limits.firstAsciiChar.min, limits.firstAsciiChar.max, defaultSettings.firstAsciiChar),
        xAdvance: clampInteger(source.xAdvance, limits.xAdvance.min, limits.xAdvance.max, defaultSettings.xAdvance),
    };
}

export function mergeFrameTuning(baseSettings, rawTuning) {
    return normalizeSettings(Object.assign({}, baseSettings || {}, normalizeFrameTuning(rawTuning)));
}

import { normalizeSettings, mergeFrameTuning } from "../core/settings.js";
import { processFrame } from "../imaging/processor.js";
import * as Frames from "../workflow/frames.js";
import { buildTokens } from "./packing.js";
import { formatPlain, formatArduinoMulti } from "./formats.js";

function pickPixelData(result, pixelFormat) {
    if (pixelFormat === "rgb565") return result.rgb565Data;
    if (pixelFormat === "rgb888") return result.rgb888Data;
    return result.binaryData;
}

// Render every source frame to {name, width, height, tokens}.
function renderFrames(safe) {
    const canvas = document.createElement("canvas");
    canvas.width = safe.width;
    canvas.height = safe.height;
    return Frames.getFrames().map((frame) => {
        const frameSafe = frame.tuning ? mergeFrameTuning(safe, frame.tuning) : safe;
        const result = processFrame(canvas, frame.source, frameSafe);
        const data = pickPixelData(result, safe.pixelFormat);
        return { name: frame.name, width: safe.width, height: safe.height, tokens: buildTokens(data, frameSafe) };
    });
}

const FORMATTERS = {
    plain: formatPlain,
    arduino: formatArduinoMulti,
};

export function generate(settings) {
    const safe = normalizeSettings(settings);
    if (!Frames.hasFrames()) return "";
    const frames = renderFrames(safe);
    const formatter = FORMATTERS[safe.outputFormat] || formatArduinoMulti;
    return formatter(frames, safe);
}

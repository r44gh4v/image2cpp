import { normalizeSettings, mergeFrameTuning } from "../core/settings.js";
import { Processor } from "../imaging/processor.js";
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

    const sources = Processor.sourceIsGif && Processor.gifFrames.length > 0
        ? Processor.gifFrames.map((f) => ({ source: f.imgData, tuning: f.tuning || null }))
        : [{ source: Processor.sourceImage, tuning: null }];

    return sources.map((entry) => {
        const frameSafe = entry.tuning ? mergeFrameTuning(safe, entry.tuning) : safe;
        const result = Processor.processFrame(canvas, entry.source, frameSafe);
        const data = pickPixelData(result, safe.pixelFormat);
        return {
            name: safe.varName,
            width: safe.width,
            height: safe.height,
            tokens: buildTokens(data, frameSafe),
        };
    });
}

const FORMATTERS = {
    plain: formatPlain,
    arduino: formatArduinoMulti,
};

export function generate(settings) {
    const safe = normalizeSettings(settings);
    if (!Processor.sourceImage) return "";
    const frames = renderFrames(safe);
    const formatter = FORMATTERS[safe.outputFormat] || formatArduinoMulti;
    return formatter(frames, safe);
}

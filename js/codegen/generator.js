import { normalizeSettings, mergeFrameTuning } from "../core/settings.js";
import { processFrame } from "../imaging/processor.js";
import * as Frames from "../workflow/frames.js";
import { buildTokens } from "./packing.js";
import { formatPlain, formatArduinoMulti, formatArduinoSingle, formatAdafruitGfx } from "./formats.js";

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
    const expectedPixels = safe.width * safe.height;
    return Frames.getFrames().map((frame) => {
        const frameSafe = frame.tuning ? mergeFrameTuning(safe, frame.tuning) : safe;
        const result = processFrame(canvas, frame.source, frameSafe);
        const data = pickPixelData(result, safe.pixelFormat);
        // Guard against a buffer that does not match the declared dimensions —
        // packing trusts safe.width/height, so a mismatch would emit a wrong-sized
        // (silently corrupt) array. Fail loud instead.
        if (!data || data.length !== expectedPixels) {
            throw new Error(`frame "${frame.name}" produced ${data ? data.length : 0} pixels, expected ${safe.width}×${safe.height}=${expectedPixels}`);
        }
        return { name: frame.name, width: safe.width, height: safe.height, tokens: buildTokens(data, frameSafe) };
    });
}

const FORMATTERS = {
    plain: formatPlain,
    arduino: formatArduinoMulti,
    arduino_single: formatArduinoSingle,
    adafruit_gfx: formatAdafruitGfx,
};

export function generate(settings) {
    const safe = normalizeSettings(settings);
    if (!Frames.hasFrames()) return "";
    let frames;
    try {
        frames = renderFrames(safe);
    } catch (err) {
        // Surface the problem in the output instead of throwing through the
        // preview pipeline (which would abort the whole render).
        return `// image2cpp: cannot generate — ${err.message}`;
    }
    const formatter = FORMATTERS[safe.outputFormat] || formatArduinoMulti;
    return formatter(frames, safe);
}

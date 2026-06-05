import { loadImageElement, decodeGif } from "../imaging/processor.js";
import { sanitizeVarName } from "../core/settings.js";
import { createObjectUrl, revokeObjectUrl } from "./object-urls.js";

function stem(fileName) {
    const name = typeof fileName === "string" ? fileName : "";
    return name.includes(".") ? name.split(".").slice(0, -1).join(".") : name;
}

export function isSupportedImage(file) {
    return Boolean(file && typeof file.type === "string" && file.type.startsWith("image/"));
}

// Returns a Promise<Frame[]>. Mixed selections of stills become N frames.
// A single GIF becomes N frames. A GIF mixed with stills: the GIF is expanded,
// stills appended, all sharing the global canvas size.
export async function ingestFiles(fileList) {
    const files = Array.from(fileList || []).filter(isSupportedImage);
    files.sort((a, b) => (a.name > b.name ? 1 : a.name < b.name ? -1 : 0));
    const frames = [];
    for (const file of files) {
        if (file.type === "image/gif") {
            try {
                const buf = await file.arrayBuffer();
                const decoded = decodeGif(buf);
                decoded.frames.forEach((fr, i) => frames.push({
                    source: fr.imageData,
                    name: `${stem(file.name)}_${i}`,
                    delayMs: fr.delayMs,
                }));
                continue;
            } catch (err) {
                console.error("GIF parse failed; loading as static.", err);
            }
        }
        const url = createObjectUrl(file);
        try {
            const img = await loadImageElement(url);
            frames.push({ source: img, name: stem(file.name), delayMs: 0 });
        } finally {
            revokeObjectUrl(url);
        }
    }
    return frames;
}

export function safeVarNameFromFiles(fileList) {
    const first = Array.from(fileList || [])[0];
    return first ? sanitizeVarName(stem(first.name), "byte array") : "byte array";
}

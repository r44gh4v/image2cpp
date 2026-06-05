// Decorates the dithering custom-select with a small live preview of each
// method (a gradient strip run through that method) plus a one-line tooltip, so
// users can see what each option does before picking it.

import { applyDithering } from "../imaging/dithering.js";

const DESCRIPTIONS = {
    binary: "Hard cutoff at the threshold slider.",
    otsu: "Auto threshold from the image histogram. Great for clean / pixel art.",
    adaptive: "Local (per-region) threshold. Best for text and line art.",
    bayer: "Ordered 4×4 cross-hatch pattern.",
    bayer8: "Ordered 8×8 — finer, smoother pattern.",
    floydsteinberg: "Error diffusion — classic, balanced.",
    jarvis: "Error diffusion — smooth, wide spread.",
    stucki: "Error diffusion — smooth and sharp.",
    sierra: "Error diffusion — smooth, a bit faster.",
    burkes: "Error diffusion — lighter, higher contrast.",
    atkinson: "Error diffusion — high contrast, sparse dots.",
};

const SWATCH_W = 52;
const SWATCH_H = 16;

function makeSwatch(method) {
    const canvas = document.createElement("canvas");
    canvas.width = SWATCH_W;
    canvas.height = SWATCH_H;
    canvas.className = "dither-swatch";
    canvas.setAttribute("aria-hidden", "true");
    const ctx = canvas.getContext("2d");
    if (!ctx) return canvas;

    const img = ctx.createImageData(SWATCH_W, SWATCH_H);
    const d = img.data;
    // Horizontal gradient with a faint vertical ripple so adaptive/local methods
    // also show some structure instead of a flat field.
    for (let y = 0; y < SWATCH_H; y++) {
        for (let x = 0; x < SWATCH_W; x++) {
            let v = (x / (SWATCH_W - 1)) * 255;
            v += Math.sin((y / SWATCH_H) * Math.PI * 2) * 18;
            v = v < 0 ? 0 : v > 255 ? 255 : v;
            const i = (y * SWATCH_W + x) * 4;
            d[i] = d[i + 1] = d[i + 2] = v;
            d[i + 3] = 255;
        }
    }
    applyDithering(d, SWATCH_W, 128, method);
    ctx.putImageData(img, 0, 0);
    return canvas;
}

export function decorateDitherSelect(select) {
    if (!select) return;
    const wrapper = select.nextElementSibling;
    if (!wrapper || !wrapper.classList.contains("custom-select-wrapper")) return;

    const options = Array.from(select.options); // flat, in DOM order
    const nodes = wrapper.querySelectorAll(".custom-select-option");
    nodes.forEach((node, index) => {
        const option = options[index];
        if (!option) return;
        if (node.querySelector(".dither-swatch")) return; // already decorated
        node.classList.add("has-swatch");
        node.prepend(makeSwatch(option.value));
        const desc = DESCRIPTIONS[option.value];
        if (desc) node.title = desc;
    });
}

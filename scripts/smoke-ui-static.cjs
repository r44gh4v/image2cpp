const fs = require("fs");
const path = require("path");

const repoRoot = path.resolve(__dirname, "..");
const indexPath = path.join(repoRoot, "index.html");
const cssPath = path.join(repoRoot, "css", "style.css");

function assert(condition, message) {
    if (!condition) {
        throw new Error(message);
    }
}

function readText(filePath) {
    return fs.readFileSync(filePath, "utf8");
}

const html = readText(indexPath);
const css = readText(cssPath);

const requiredIds = [
    "app-theme-toggle",
    "visit-count",
    "drop-zone",
    "file-input",
    "canvas-width",
    "canvas-height",
    "setting-scale",
    "setting-contrast",
    "setting-threshold",
    "setting-invert",
    "setting-invert-bg",
    "draw-mode",
    "output-format",
    "var-name",
    "preview-theme",
    "preview-canvas",
    "preview-info",
    "gif-frames",
    "code-output",
    "btn-copy",
    "btn-download",
];

requiredIds.forEach((id) => {
    assert(html.includes(`id="${id}"`), `Missing required UI element id=${id}`);
});

const requiredScriptsInOrder = [
    "js/vendor/omggif.js",
    "js/processor.js",
    "js/generator.js",
    "js/core/constants.js",
    "js/core/settings.js",
    "js/core/frame-manager.js",
    "js/core/url-manager.js",
    "js/core/state-store.js",
    "js/core/ui-theme-service.js",
    "js/core/visit-counter-service.js",
    "js/core/preview-service.js",
    "js/core/gif-workflow-service.js",
    "js/core/file-workflow-service.js",
    "js/ui/custom-select-controller.js",
    "js/main.js",
];

let lastIndex = -1;
requiredScriptsInOrder.forEach((script) => {
    const marker = `src="${script}"`;
    const index = html.indexOf(marker);
    assert(index >= 0, `Missing script tag for ${script}`);
    assert(index > lastIndex, `Script load order is incorrect at ${script}`);
    lastIndex = index;
});

const requiredCssSelectors = [
    ".custom-select-wrapper",
    ".custom-select-trigger",
    ".custom-select-option",
    ".gif-frames-timeline",
    ".gif-thumb-wrap.active",
    ".drop-zone.is-dragover",
    ".is-hidden",
];

requiredCssSelectors.forEach((selector) => {
    assert(css.includes(selector), `Missing CSS selector ${selector}`);
});

console.log("Static UI smoke checks passed.");

const fs = require("fs");
const path = require("path");

const repoRoot = path.resolve(__dirname, "..");
const indexPath = path.join(repoRoot, "index.html");
const cssPath = path.join(repoRoot, "css", "style.css");

const requiredRootFiles = [
    "robots.txt",
    "sitemap.xml",
    "manifest.json",
    "llms.txt",
    "llms-full.txt",
    path.join("docs", "index.html"),
    path.join("docs", "faq.html"),
    path.join("docs", "getting-started.html"),
    path.join("docs", "gif-workflow.html"),
    path.join("docs", "arduino-oled-guide.html"),
    path.join("docs", "troubleshooting.html"),
];

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

requiredRootFiles.forEach((relativePath) => {
    const fullPath = path.join(repoRoot, relativePath);
    assert(fs.existsSync(fullPath), `Missing required SEO/GEO file ${relativePath}`);
});

assert(html.includes('name="description"'), "Missing meta description");
assert(html.includes('rel="canonical" href="https://r44gh4v.github.io/image2cpp/"'), "Missing canonical URL");
assert(html.includes('name="robots" content="index,follow'), "Missing robots meta");
assert(html.includes('property="og:title"'), "Missing Open Graph title");
assert(html.includes('name="twitter:card"'), "Missing Twitter card tag");
assert(html.includes('application/ld+json'), "Missing JSON-LD schema");
assert(html.includes('rel="manifest" href="manifest.json"'), "Missing web app manifest link");

assert(
    html.includes('name="google-site-verification" content="lq_9FkMsSsJFQs45Rldynox2MuGWefzc1Rcc_9DGRe0"'),
    "Missing Google Search Console verification meta tag",
);
assert(
    html.includes('https://www.googletagmanager.com/gtag/js?id=G-RRDJ2CF0XN'),
    "Missing GA4 gtag loader script",
);
assert(
    html.includes("window.Image2CppAnalyticsConfig"),
    "Missing analytics config bootstrap",
);

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
    "js/core/analytics-service.js",
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
    ".seo-discovery",
    ".is-hidden",
];

requiredCssSelectors.forEach((selector) => {
    assert(css.includes(selector), `Missing CSS selector ${selector}`);
});

console.log("Static UI smoke checks passed.");

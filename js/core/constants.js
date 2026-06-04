(function initImage2CppConstants(root) {
    const DEFAULT_SETTINGS = {
        width: 128,
        height: 64,
        scale: "fit",
        contrast: 0,
        threshold: 128,
        dither: "binary",
        pixelFormat: "mono1",
        invert: false,
        invertBg: false,
        flipH: false,
        flipV: false,
        rotate: 0,
        outputFormat: "arduino",
        drawMode: "horizontal",
        bitSwap: false,
        varName: "byte array",
        theme: "oled-white",
    };

    const LIMITS = {
        width: { min: 1, max: 8192 },
        height: { min: 1, max: 8192 },
        contrast: { min: -255, max: 255 },
        threshold: { min: 0, max: 255 },
        rotateStep: 90,
    };

    const ALLOWED_VALUES = {
        scale: ["fit", "stretch", "original"],
        dither: ["binary", "bayer", "floydsteinberg", "atkinson"],
        pixelFormat: ["mono1", "rgb565", "rgb888", "alpha"],
        outputFormat: ["arduino", "plain"],
        drawMode: ["horizontal", "vertical"],
        theme: ["oled-white", "oled-blue", "oled-yellow", "lcd-green"],
    };

    const api = {
        DEFAULT_SETTINGS,
        LIMITS,
        ALLOWED_VALUES,
    };

    if (typeof module !== "undefined" && module.exports) {
        module.exports = api;
    }

    root.Image2CppConstants = api;
})(typeof globalThis !== "undefined" ? globalThis : this);

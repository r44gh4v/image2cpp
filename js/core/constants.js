export const DEFAULT_SETTINGS = {
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
    smoothScaling: true,
    varName: "byte array",
    theme: "oled-white",
    firstAsciiChar: 48,
    xAdvance: 0,
};

export const LIMITS = {
    width: { min: 1, max: 8192 },
    height: { min: 1, max: 8192 },
    contrast: { min: -255, max: 255 },
    threshold: { min: 0, max: 255 },
    firstAsciiChar: { min: 0, max: 255 },
    xAdvance: { min: 0, max: 255 },
    rotateStep: 90,
};

export const ALLOWED_VALUES = {
    scale: ["fit", "stretch", "original"],
    dither: ["binary", "bayer", "floydsteinberg", "atkinson"],
    pixelFormat: ["mono1", "rgb565", "rgb888", "alpha"],
    outputFormat: ["arduino", "arduino_single", "adafruit_gfx", "plain"],
    drawMode: ["horizontal", "vertical"],
    theme: ["oled-white", "oled-blue", "oled-yellow", "lcd-green"],
};

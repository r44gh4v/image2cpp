const assert = require("assert");
const Processor = require("../js/processor.js");

{
    const imageData = {
        data: new Uint8ClampedArray([
            0, 0, 0, 255,
            255, 255, 255, 255,
            60, 60, 60, 255,
            240, 240, 240, 0,
        ]),
    };

    const result = Processor.applyFiltersAndColorMap(imageData, 2, 2, {
        threshold: "999",
        contrast: "-999",
        processingMethod: "threshold",
        invert: "true",
        invertBg: "false",
        theme: "unknown-theme",
    });

    assert.strictEqual(result.binaryData.length, 4);
    for (const bit of result.binaryData) {
        assert.ok(bit === 0 || bit === 1);
    }
}

{
    const makeImageData = () => ({
        data: new Uint8ClampedArray([
            0, 0, 0, 255,
            255, 255, 255, 0,
        ]),
    });

    const normal = Processor.applyFiltersAndColorMap(makeImageData(), 2, 1, {
        threshold: 128,
        contrast: 0,
        processingMethod: "threshold",
        invert: false,
        invertBg: false,
        theme: "oled-white",
    });

    const invertedBgOnly = Processor.applyFiltersAndColorMap(makeImageData(), 2, 1, {
        threshold: 128,
        contrast: 0,
        processingMethod: "threshold",
        invert: false,
        invertBg: true,
        theme: "oled-white",
    });

    assert.deepStrictEqual(Array.from(normal.binaryData), [1, 0]);
    assert.deepStrictEqual(Array.from(invertedBgOnly.binaryData), [1, 1]);
}

{
    const originalSourceImage = Processor.sourceImage;
    try {
        Processor.sourceImage = { width: 2, height: 2 };

        const canvas = {
            width: 2,
            height: 2,
            getContext() {
                return {
                    clearRect() {},
                    save() {},
                    translate() {},
                    rotate() {},
                    scale() {},
                    drawImage() {},
                    restore() {},
                    getImageData() {
                        return {
                            data: new Uint8ClampedArray([
                                0, 0, 0, 255,
                                255, 255, 255, 255,
                                80, 80, 80, 255,
                                200, 200, 200, 255,
                            ]),
                        };
                    },
                    putImageData() {},
                };
            },
        };

        const settings = {
            width: "bad",
            height: "bad",
            scale: "invalid",
            rotate: "invalid",
            contrast: "invalid",
            threshold: "invalid",
            drawMode: "invalid",
            outputFormat: "invalid",
            varName: "***",
        };

        const result = Processor.processFrame(canvas, { id: "source" }, settings);

        assert.strictEqual(result.binaryData.length, 4);

        const previewResult = Processor.processFrame(
            canvas,
            { id: "source" },
            settings,
            { skipBinary: true },
        );

        assert.strictEqual(previewResult.binaryData, null);
    } finally {
        Processor.sourceImage = originalSourceImage;
    }
}

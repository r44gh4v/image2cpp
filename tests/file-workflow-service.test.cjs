const assert = require("assert");
const workflowServiceFactory = require("../js/core/file-workflow-service.js");

const originalFileReader = global.FileReader;
const originalSetTimeout = global.setTimeout;

try {
    const createdUrls = [];
    const revokedUrls = [];
    const loadedImages = [];
    const loadedGifs = [];

    const processor = {
        loadImage(src, callback) {
            loadedImages.push(src);
            if (typeof callback === "function") {
                callback();
            }
        },
        loadGif(buffer, callback) {
            loadedGifs.push(buffer);
            if (typeof callback === "function") {
                callback();
            }
        },
    };

    const settingsContract = {
        sanitizeVarName(name, fallback) {
            if (!name) {
                return fallback;
            }
            return name.replace(/[^a-zA-Z0-9_]/g, "_").replace(/^[0-9]/, "_$&");
        },
    };

    const service = workflowServiceFactory.create({
        processor,
        settingsContract,
        createObjectUrl(file) {
            const url = `blob:${file.name}`;
            createdUrls.push(url);
            return url;
        },
        revokeObjectUrl(url) {
            revokedUrls.push(url);
        },
    });

    {
        assert.strictEqual(service.isSupportedImage({ type: "image/png" }), true);
        assert.strictEqual(service.isSupportedImage({ type: "text/plain" }), false);
        assert.strictEqual(service.getSafeVariableName("9-logo final.png", "bitmap"), "_9_logo_final");
    }

    {
        let readyCount = 0;
        const loaded = service.loadFile({ name: "sample.png", type: "image/png" }, () => {
            readyCount += 1;
        });

        assert.strictEqual(loaded, true);
        assert.strictEqual(readyCount, 1);
        assert.deepStrictEqual(loadedImages.slice(-1), ["blob:sample.png"]);
        assert.deepStrictEqual(revokedUrls.slice(-1), ["blob:sample.png"]);
    }

    {
        class FakeReader {
            readAsArrayBuffer(file) {
                this.onload({ target: { result: `buffer:${file.name}` } });
            }
        }

        global.FileReader = FakeReader;
        global.setTimeout = (callback) => {
            callback();
            return 1;
        };

        let readyCount = 0;
        const loaded = service.loadFile({ name: "anim.gif", type: "image/gif" }, () => {
            readyCount += 1;
        });

        assert.strictEqual(loaded, true);
        assert.strictEqual(readyCount, 1);
        assert.deepStrictEqual(loadedGifs.slice(-1), ["buffer:anim.gif"]);
    }

    {
        class FakeReader {
            readAsArrayBuffer(file) {
                this.onload({ target: { result: `buffer:${file.name}` } });
            }
        }

        global.FileReader = FakeReader;
        global.setTimeout = (callback) => {
            callback();
            return 1;
        };

        const originalConsoleError = console.error;
        console.error = () => {};

        try {
            let fallbackReadyCount = 0;
            const throwingProcessor = {
                loadImage(src, callback) {
                    loadedImages.push(src);
                    if (typeof callback === "function") {
                        callback();
                    }
                },
                loadGif() {
                    throw new Error("gif parse failure");
                },
            };

            const fallbackService = workflowServiceFactory.create({
                processor: throwingProcessor,
                settingsContract,
                createObjectUrl(file) {
                    const url = `blob:fallback-${file.name}`;
                    createdUrls.push(url);
                    return url;
                },
                revokeObjectUrl(url) {
                    revokedUrls.push(url);
                },
            });

            const loaded = fallbackService.loadFile({ name: "broken.gif", type: "image/gif" }, () => {
                fallbackReadyCount += 1;
            });

            assert.strictEqual(loaded, true);
            assert.strictEqual(fallbackReadyCount, 1);
            assert.deepStrictEqual(loadedImages.slice(-1), ["blob:fallback-broken.gif"]);
            assert.deepStrictEqual(revokedUrls.slice(-1), ["blob:fallback-broken.gif"]);
        } finally {
            console.error = originalConsoleError;
        }
    }

    {
        const loaded = service.loadFile({ name: "note.txt", type: "text/plain" }, () => {});
        assert.strictEqual(loaded, false);
    }
} finally {
    if (typeof originalFileReader === "undefined") {
        delete global.FileReader;
    } else {
        global.FileReader = originalFileReader;
    }

    if (typeof originalSetTimeout === "undefined") {
        delete global.setTimeout;
    } else {
        global.setTimeout = originalSetTimeout;
    }
}

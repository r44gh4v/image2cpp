(function initImage2CppFileWorkflowService(root) {
    function defaultSanitizeVarName(rawName, fallback) {
        const safeFallback = typeof fallback === "string" && fallback.length > 0 ? fallback : "bitmap";
        const source = typeof rawName === "string" ? rawName.trim() : "";
        const replaced = source.replace(/[^a-zA-Z0-9_]/g, "_");
        const prefixed = replaced.replace(/^[0-9]/, "_$&");
        const collapsed = prefixed.replace(/_+/g, "_").replace(/_+$/g, "");
        return collapsed || safeFallback;
    }

    function create(options) {
        const opts = options || {};
        const processor = opts.processor;
        const settingsContract = opts.settingsContract;
        const createObjectUrl = opts.createObjectUrl;
        const revokeObjectUrl = opts.revokeObjectUrl;

        if (!processor || typeof processor.loadImage !== "function" || typeof processor.loadGif !== "function") {
            throw new Error("Image2CppFileWorkflowService requires processor.loadImage/loadGif.");
        }

        if (typeof createObjectUrl !== "function" || typeof revokeObjectUrl !== "function") {
            throw new Error("Image2CppFileWorkflowService requires createObjectUrl/revokeObjectUrl callbacks.");
        }

        function isSupportedImage(file) {
            return Boolean(file && typeof file.type === "string" && file.type.startsWith("image/"));
        }

        function getSafeVariableName(fileName, fallback) {
            const safeFallback = typeof fallback === "string" && fallback.length > 0 ? fallback : "bitmap";
            const name = typeof fileName === "string" ? fileName : "";
            const base = name.includes(".") ? name.split(".").slice(0, -1).join(".") : name;

            if (settingsContract && typeof settingsContract.sanitizeVarName === "function") {
                return settingsContract.sanitizeVarName(base, safeFallback);
            }

            return defaultSanitizeVarName(base, safeFallback);
        }

        function loadStatic(file, onReady) {
            const objectUrl = createObjectUrl(file);
            if (!objectUrl) {
                return false;
            }

            processor.loadImage(objectUrl, () => {
                revokeObjectUrl(objectUrl);
                if (typeof onReady === "function") {
                    onReady();
                }
            });

            return true;
        }

        function loadGif(file, onReady) {
            if (typeof FileReader !== "function") {
                return false;
            }

            const reader = new FileReader();
            reader.onload = (event) => {
                setTimeout(() => {
                    try {
                        processor.loadGif(event.target.result, () => {
                            if (typeof onReady === "function") {
                                onReady();
                            }
                        });
                    } catch (error) {
                        console.error("GIF parsing failed. Falling back to static preview.", error);
                        const fallbackUrl = createObjectUrl(file);
                        if (!fallbackUrl) {
                            return;
                        }

                        processor.loadImage(fallbackUrl, () => {
                            revokeObjectUrl(fallbackUrl);
                            if (typeof onReady === "function") {
                                onReady();
                            }
                        });
                    }
                }, 10);
            };
            reader.readAsArrayBuffer(file);
            return true;
        }

        function loadFile(file, onReady) {
            if (!isSupportedImage(file)) {
                return false;
            }

            if (file.type === "image/gif") {
                return loadGif(file, onReady);
            }

            return loadStatic(file, onReady);
        }

        return {
            isSupportedImage,
            getSafeVariableName,
            loadFile,
        };
    }

    const api = { create };

    if (typeof module !== "undefined" && module.exports) {
        module.exports = api;
    }

    root.Image2CppFileWorkflowService = api;
})(typeof globalThis !== "undefined" ? globalThis : this);

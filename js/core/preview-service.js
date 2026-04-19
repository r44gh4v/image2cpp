(function initImage2CppPreviewService(root) {
    function create(options) {
        const processor = options && options.processor;
        if (!processor || typeof processor.processFrame !== "function") {
            throw new Error("Image2CppPreviewService requires a processor with processFrame().");
        }

        function setPresetActiveButtons(buttons, width, height) {
            if (!buttons) {
                return;
            }

            buttons.forEach((button) => {
                const preset = button && button.dataset ? button.dataset.preset : "";
                if (!preset || preset.indexOf("x") === -1) {
                    return;
                }

                const [presetWidth, presetHeight] = preset.split("x");
                const isActive = Number(presetWidth) === width && Number(presetHeight) === height;
                button.classList.toggle("active", isActive);
            });
        }

        function syncPreviewSurface(canvas, timeline, isGif, width, height) {
            if (canvas) {
                canvas.width = width;
                canvas.height = height;
                canvas.classList.toggle("is-gif", Boolean(isGif));
            }

            if (timeline) {
                timeline.classList.toggle("is-hidden", !isGif);
                if (!isGif && timeline.dataset) {
                    delete timeline.dataset.activeIndex;
                }
            }
        }

        function setTimelineActive(timeline, activeIndex) {
            if (!timeline || !timeline.children) {
                return;
            }

            const supportsDataset = Boolean(timeline.dataset);
            if (!supportsDataset) {
                Array.from(timeline.children).forEach((element, index) => {
                    element.classList.toggle("active", index === activeIndex);
                });
                return;
            }

            const previousRaw = timeline.dataset.activeIndex;
            const previousIndex = previousRaw === undefined
                ? -1
                : Number.parseInt(previousRaw, 10);

            if (previousIndex === activeIndex) {
                return;
            }

            if (
                Number.isInteger(previousIndex)
                && previousIndex >= 0
                && previousIndex < timeline.children.length
            ) {
                timeline.children[previousIndex].classList.toggle("active", false);
            }

            if (
                Number.isInteger(activeIndex)
                && activeIndex >= 0
                && activeIndex < timeline.children.length
            ) {
                timeline.children[activeIndex].classList.toggle("active", true);
                timeline.dataset.activeIndex = String(activeIndex);
                return;
            }

            delete timeline.dataset.activeIndex;
        }

        function renderToCanvas(canvas, source, settings, options) {
            return processor.processFrame(canvas, source, settings, options);
        }

        return {
            setPresetActiveButtons,
            syncPreviewSurface,
            setTimelineActive,
            renderToCanvas,
        };
    }

    const api = { create };

    if (typeof module !== "undefined" && module.exports) {
        module.exports = api;
    }

    root.Image2CppPreviewService = api;
})(typeof globalThis !== "undefined" ? globalThis : this);

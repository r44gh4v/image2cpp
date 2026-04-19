(function initImage2CppGifWorkflowService(root) {
    const MIN_FRAME_DELAY_MS = 20;

    function create(options) {
        const opts = options || {};
        const frameTuningManager = opts.frameTuningManager || null;

        function applyUiTuning(params) {
            const config = params || {};
            const frames = Array.isArray(config.frames) ? config.frames : [];
            const isPaused = Boolean(config.isPaused);
            const currentFrame = Number.isInteger(config.currentFrame) ? config.currentFrame : 0;
            const uiTuning = config.uiTuning || {};

            if (frames.length === 0) {
                return;
            }

            if (isPaused) {
                const activeFrame = frames[currentFrame];
                if (frameTuningManager && typeof frameTuningManager.applyUiTuningToFrame === "function") {
                    frameTuningManager.applyUiTuningToFrame(activeFrame, uiTuning);
                } else if (activeFrame) {
                    activeFrame.tuning = Object.assign({}, activeFrame.tuning || {}, uiTuning);
                }
                return;
            }

            if (frameTuningManager && typeof frameTuningManager.applyUiTuningToFrames === "function") {
                frameTuningManager.applyUiTuningToFrames(frames, uiTuning);
                return;
            }

            frames.forEach((frame) => {
                frame.tuning = Object.assign({}, frame.tuning || {}, uiTuning);
            });
        }

        function needsTimelineRebuild(params) {
            const config = params || {};
            const timeline = config.timeline;
            const settings = config.currentSettings || {};

            if (!timeline || !timeline.children) {
                return true;
            }

            return timeline.children.length === 0
                || settings.width !== config.lastW
                || settings.height !== config.lastH
                || settings.scale !== config.lastScale;
        }

        function renderSingleThumbnail(params) {
            const config = params || {};
            const timeline = config.timeline;
            const frames = Array.isArray(config.frames) ? config.frames : [];
            const index = Number.isInteger(config.index) ? config.index : -1;
            const getSettings = config.getSettings;
            const renderToCanvas = config.renderToCanvas;

            if (!timeline || !timeline.children || index < 0 || index >= frames.length) {
                return false;
            }

            if (timeline.children.length <= index + 1) {
                return false;
            }

            const thumbWrap = timeline.children[index + 1];
            const thumb = thumbWrap && typeof thumbWrap.querySelector === "function"
                ? thumbWrap.querySelector("canvas")
                : null;

            if (!thumb || typeof renderToCanvas !== "function" || typeof getSettings !== "function") {
                return false;
            }

            renderToCanvas(thumb, frames[index].imgData, getSettings(index));
            return true;
        }

        function rebuildTimeline(params) {
            const config = params || {};
            const timeline = config.timeline;
            const frames = Array.isArray(config.frames) ? config.frames : [];
            const currentSettings = config.currentSettings || {};
            const isPaused = Boolean(config.isPaused);
            const currentFrame = Number.isInteger(config.currentFrame) ? config.currentFrame : 0;
            const getSettings = config.getSettings;
            const renderToCanvas = config.renderToCanvas;
            const onPlayAll = config.onPlayAll;
            const onSelectFrame = config.onSelectFrame;

            if (!timeline || frames.length === 0 || typeof getSettings !== "function" || typeof renderToCanvas !== "function") {
                return false;
            }

            timeline.innerHTML = "";

            const animationWrap = document.createElement("div");
            animationWrap.className = `gif-thumb-wrap ${!isPaused ? "active" : ""}`;
            animationWrap.title = "Play Full Animation";

            const animationThumb = document.createElement("canvas");
            animationThumb.className = "gif-frame-thumb animation-thumb";
            animationThumb.width = currentSettings.width;
            animationThumb.height = currentSettings.height;
            renderToCanvas(animationThumb, frames[0].imgData, getSettings(0));

            const playIcon = document.createElement("div");
            playIcon.className = "thumb-label play-icon";
            playIcon.innerHTML = "<svg width=\"12\" height=\"12\" viewBox=\"0 0 24 24\" fill=\"currentColor\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><polygon points=\"5 3 19 12 5 21 5 3\"></polygon></svg>";

            animationWrap.appendChild(animationThumb);
            animationWrap.appendChild(playIcon);
            animationWrap.addEventListener("click", () => {
                if (typeof onPlayAll === "function") {
                    onPlayAll();
                }
            });
            timeline.appendChild(animationWrap);

            frames.forEach((frame, index) => {
                const thumbWrap = document.createElement("div");
                thumbWrap.className = `gif-thumb-wrap ${isPaused && currentFrame === index ? "active" : ""}`;
                thumbWrap.title = `Frame ${index + 1}`;

                const thumb = document.createElement("canvas");
                thumb.className = "gif-frame-thumb";
                thumb.width = currentSettings.width;
                thumb.height = currentSettings.height;
                renderToCanvas(thumb, frame.imgData, getSettings(index));

                const label = document.createElement("div");
                label.className = "thumb-label";
                label.textContent = String(index + 1);

                thumbWrap.appendChild(thumb);
                thumbWrap.appendChild(label);
                thumbWrap.addEventListener("click", () => {
                    if (typeof onSelectFrame === "function") {
                        onSelectFrame(index, frame);
                    }
                });

                timeline.appendChild(thumbWrap);
            });

            return true;
        }

        function refreshTimelineThumbnails(params) {
            const config = params || {};
            const timeline = config.timeline;
            const frames = Array.isArray(config.frames) ? config.frames : [];
            const isPaused = Boolean(config.isPaused);
            const currentFrame = Number.isInteger(config.currentFrame) ? config.currentFrame : 0;
            const isLive = Boolean(config.isLive);
            const getSettings = config.getSettings;
            const renderToCanvas = config.renderToCanvas;
            const requestFrame = typeof config.requestFrame === "function" ? config.requestFrame : null;

            if (!timeline || frames.length === 0 || typeof getSettings !== "function" || typeof renderToCanvas !== "function") {
                return;
            }

            if (isPaused) {
                renderSingleThumbnail({
                    timeline,
                    frames,
                    index: currentFrame,
                    getSettings,
                    renderToCanvas,
                });
                return;
            }

            if (!isLive) {
                const renderBatch = () => {
                    for (let index = 0; index < frames.length; index += 1) {
                        renderSingleThumbnail({
                            timeline,
                            frames,
                            index,
                            getSettings,
                            renderToCanvas,
                        });
                    }

                    const animationWrap = timeline.children[0];
                    const animationCanvas = animationWrap && typeof animationWrap.querySelector === "function"
                        ? animationWrap.querySelector("canvas")
                        : null;
                    if (animationCanvas) {
                        renderToCanvas(animationCanvas, frames[0].imgData, getSettings(0));
                    }
                };

                if (requestFrame) {
                    requestFrame(renderBatch);
                } else {
                    renderBatch();
                }
            }
        }

        function startPlayback(params) {
            const config = params || {};
            const appState = config.appState || {};
            const setStateValue = config.setStateValue;
            const processor = config.processor;
            const getSettings = config.getSettings;
            const renderToCanvas = config.renderToCanvas;
            const previewCanvas = config.previewCanvas;
            const previewInfo = config.previewInfo;
            const setActiveTimelineEntry = config.setActiveTimelineEntry;
            const scheduleFn = typeof config.scheduleFn === "function" ? config.scheduleFn : setTimeout;
            const clearFn = typeof config.clearFn === "function" ? config.clearFn : clearTimeout;
            const nowFn = typeof config.nowFn === "function"
                ? config.nowFn
                : (() => {
                    if (typeof performance !== "undefined" && typeof performance.now === "function") {
                        return performance.now();
                    }

                    return Date.now();
                });

            if (!processor || typeof getSettings !== "function" || typeof renderToCanvas !== "function") {
                return;
            }

            if (appState.gifTimer) {
                clearFn(appState.gifTimer);
                if (typeof setStateValue === "function") {
                    setStateValue("gifTimer", null);
                } else {
                    appState.gifTimer = null;
                }
            }

            function normalizeFrameIndex(index, length) {
                if (!Number.isInteger(index) || length <= 0) {
                    return 0;
                }

                return ((index % length) + length) % length;
            }

            const renderNextFrame = (requestedIndex) => {
                if (!processor.sourceIsGif) {
                    return;
                }

                const frames = Array.isArray(processor.gifFrames) ? processor.gifFrames : [];
                if (frames.length === 0) {
                    if (typeof setStateValue === "function") {
                        setStateValue("gifTimer", null);
                    } else {
                        appState.gifTimer = null;
                    }
                    return;
                }

                if (!appState.isPaused) {
                    const frameIndex = normalizeFrameIndex(requestedIndex, frames.length);
                    const frame = frames[frameIndex];

                    if (typeof setStateValue === "function") {
                        setStateValue("currentFrame", frameIndex);
                    } else {
                        appState.currentFrame = frameIndex;
                    }

                    const settings = getSettings(frameIndex);

                    const renderStart = nowFn();
                    renderToCanvas(previewCanvas, frame.imgData, settings);
                    const renderDuration = nowFn() - renderStart;
                    if (previewInfo) {
                        previewInfo.textContent = `${settings.width} × ${settings.height} | GIF: ${frameIndex + 1}/${frames.length} fr`;
                    }

                    if (typeof setActiveTimelineEntry === "function") {
                        setActiveTimelineEntry(0);
                    }

                    let delay = frame.delay * 10 || 100;
                    if (delay < MIN_FRAME_DELAY_MS) {
                        delay = 100;
                    }

                    if (renderDuration > delay) {
                        delay = MIN_FRAME_DELAY_MS;
                    }

                    const nextFrame = (frameIndex + 1) % frames.length;

                    const timerId = scheduleFn(() => {
                        renderNextFrame(nextFrame);
                    }, delay);
                    if (typeof setStateValue === "function") {
                        setStateValue("gifTimer", timerId);
                    } else {
                        appState.gifTimer = timerId;
                    }
                } else {
                    const frameIndex = normalizeFrameIndex(appState.currentFrame, frames.length);
                    const settings = getSettings(frameIndex);
                    if (previewInfo) {
                        previewInfo.textContent = `${settings.width} × ${settings.height} | GIF: ${frameIndex + 1}/${frames.length} fr (Paused)`;
                    }
                    if (typeof setStateValue === "function") {
                        setStateValue("gifTimer", null);
                    } else {
                        appState.gifTimer = null;
                    }
                }
            };

            renderNextFrame(appState.currentFrame);
        }

        return {
            applyUiTuning,
            needsTimelineRebuild,
            renderSingleThumbnail,
            rebuildTimeline,
            refreshTimelineThumbnails,
            startPlayback,
        };
    }

    const api = { create };

    if (typeof module !== "undefined" && module.exports) {
        module.exports = api;
    }

    root.Image2CppGifWorkflowService = api;
})(typeof globalThis !== "undefined" ? globalThis : this);

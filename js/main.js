/**
 * Image2Cpp Main Controller
 * Consolidated and state-driven UI logic.
 */

const INITIAL_APP_STATE = {
    gifTimer: null,
    livePreviewRafId: null,
    previewCommitTimer: null,
    currentFrame: 0,
    isPaused: false,
    isRendering: false,
    tFlipH: false,
    tFlipV: false,
    tRotate: 0,
    lastW: 0,
    lastH: 0,
    lastScale: "",
    isUpdatingSliders: false,
};

const PREVIEW_RENDER_OPTIONS = { skipBinary: true };
const PREVIEW_TIMING = {
    fast: 60,
    standard: 90,
    slider: 130,
    textCommit: 140,
};

const AppStateStoreFactory = window.Image2CppStateStore;
const AppStateStore = AppStateStoreFactory && typeof AppStateStoreFactory.create === "function"
    ? AppStateStoreFactory.create(INITIAL_APP_STATE)
    : null;
const AppState = AppStateStore ? AppStateStore.state : Object.assign({}, INITIAL_APP_STATE);

const SettingsContract = window.Image2CppSettings;
const FrameTuningManager = window.Image2CppFrameManager;
const UrlManagerFactory = window.Image2CppUrlManager;
const PreviewServiceFactory = window.Image2CppPreviewService;
const GifWorkflowServiceFactory = window.Image2CppGifWorkflowService;
const CustomSelectController = window.Image2CppCustomSelect;
const FileWorkflowServiceFactory = window.Image2CppFileWorkflowService;
const UiThemeServiceFactory = window.Image2CppUiThemeService;
const ActiveUrlManager = UrlManagerFactory && typeof UrlManagerFactory.create === "function"
    ? UrlManagerFactory.create()
    : null;
const PreviewService = PreviewServiceFactory && typeof PreviewServiceFactory.create === "function"
    ? PreviewServiceFactory.create({ processor: Processor })
    : null;
const GifWorkflowService = GifWorkflowServiceFactory && typeof GifWorkflowServiceFactory.create === "function"
    ? GifWorkflowServiceFactory.create({ frameTuningManager: FrameTuningManager })
    : null;
const FileWorkflowService = FileWorkflowServiceFactory && typeof FileWorkflowServiceFactory.create === "function"
    ? FileWorkflowServiceFactory.create({
        processor: Processor,
        settingsContract: SettingsContract,
        createObjectUrl: createManagedObjectUrl,
        revokeObjectUrl: revokeManagedObjectUrl,
    })
    : null;
const UiThemeService = UiThemeServiceFactory && typeof UiThemeServiceFactory.create === "function"
    ? UiThemeServiceFactory.create({
        storageKey: "image2cpp.uiThemeMode",
        attributeName: "data-app-theme",
        defaultMode: "system",
        modeSequence: ["system", "light", "dark"],
    })
    : null;

const APP_THEME_MODE_LABELS = {
    system: "System",
    light: "Light",
    dark: "Dark",
};

function getAppThemeModeLabel(mode) {
    return APP_THEME_MODE_LABELS[mode] || APP_THEME_MODE_LABELS.dark;
}

function setAppStateValue(key, value) {
    if (AppStateStore) {
        AppStateStore.set(key, value);
        return;
    }

    AppState[key] = value;
}

function patchAppStateValues(partial) {
    if (!partial || typeof partial !== "object") {
        return;
    }

    if (AppStateStore) {
        AppStateStore.patch(partial);
        return;
    }

    Object.assign(AppState, partial);
}

function createManagedObjectUrl(blob) {
    if (!blob) {
        return null;
    }

    if (ActiveUrlManager) {
        return ActiveUrlManager.create(blob);
    }

    return URL.createObjectURL(blob);
}

function revokeManagedObjectUrl(url) {
    if (!url) {
        return;
    }

    if (ActiveUrlManager) {
        ActiveUrlManager.revoke(url);
        return;
    }

    URL.revokeObjectURL(url);
}

function prefersReducedMotion() {
    return typeof window !== "undefined"
        && typeof window.matchMedia === "function"
        && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function clearScheduledPreview() {
    if (AppState.previewCommitTimer) {
        clearTimeout(AppState.previewCommitTimer);
        setAppStateValue("previewCommitTimer", null);
    }

    if (
        AppState.livePreviewRafId !== null
        && AppState.livePreviewRafId !== undefined
        && typeof cancelAnimationFrame === "function"
    ) {
        cancelAnimationFrame(AppState.livePreviewRafId);
        setAppStateValue("livePreviewRafId", null);
    }
}

const UI = {
    init() {
        this.appHeader = document.querySelector(".app-header");
        this.dropZone = document.getElementById("drop-zone");
        this.fileInput = document.getElementById("file-input");
        this.canvasWidth = document.getElementById("canvas-width");
        this.canvasHeight = document.getElementById("canvas-height");
        this.btnSwapWh = document.getElementById("btn-swap-wh");
        this.scaleSelect = document.getElementById("setting-scale");

        this.contrastInput = document.getElementById("setting-contrast");
        this.contrastVal = document.getElementById("contrast-val");
        this.thresholdInput = document.getElementById("setting-threshold");
        this.thresholdVal = document.getElementById("threshold-val");

        this.invertCheck = document.getElementById("setting-invert");
        this.invertBgCheck = document.getElementById("setting-invert-bg");

        // Always start with both inversion toggles disabled.
        this.invertCheck.checked = false;
        this.invertBgCheck.checked = false;

        this.optFormat = document.getElementById("output-format");
        this.optDrawMode = document.getElementById("draw-mode");
        this.optVarName = document.getElementById("var-name");
        this.previewTheme = document.getElementById("preview-theme");
        this.appThemeToggle = document.getElementById("app-theme-toggle");

        this.previewCanvas = document.getElementById("preview-canvas");
        this.previewInfo = document.getElementById("preview-info");
        this.codeOutput = document.getElementById("code-output");
        this.timeline = document.getElementById("gif-frames");

        this.btnCopy = document.getElementById("btn-copy");
        this.btnDownload = document.getElementById("btn-download");

        this.btnFlipH = document.getElementById("btn-flip-h");
        this.btnFlipV = document.getElementById("btn-flip-v");
        this.btnRotate = document.getElementById("btn-rotate");
        this.presetBtns = document.querySelectorAll(".preset-btn");

        this.syncLayoutMetrics = this.syncLayoutMetrics.bind(this);
        this.syncLayoutMetrics();

        if (document.fonts && document.fonts.ready) {
            document.fonts.ready.then(this.syncLayoutMetrics).catch(() => {});
        }

        window.addEventListener("resize", this.syncLayoutMetrics, { passive: true });

        this.bindEvents();
    },

    syncLayoutMetrics() {
        if (!this.appHeader) {
            return;
        }

        const headerHeight = Math.ceil(this.appHeader.getBoundingClientRect().height);
        document.documentElement.style.setProperty("--app-header-height", `${headerHeight}px`);
    },

    bindEvents() {
        this.timeline.addEventListener("wheel", (event) => {
            if (event.deltaY !== 0) {
                event.preventDefault();
                this.timeline.scrollLeft += event.deltaY;
            }
        });

        const doFastUpdate = () => {
            App.requestPreviewCycle(PREVIEW_TIMING.fast);
        };

        this.btnFlipH.addEventListener("click", () => {
            setAppStateValue("tFlipH", !AppState.tFlipH);
            doFastUpdate();
        });

        this.btnFlipV.addEventListener("click", () => {
            setAppStateValue("tFlipV", !AppState.tFlipV);
            doFastUpdate();
        });

        this.btnRotate.addEventListener("click", () => {
            setAppStateValue("tRotate", (AppState.tRotate + 90) % 360);
            doFastUpdate();
        });

        this.previewCanvas.addEventListener("click", () => {
            if (Processor.sourceIsGif) {
                setAppStateValue("isPaused", !AppState.isPaused);
                doFastUpdate();
            }
        });

        this.presetBtns.forEach((button) => {
            button.addEventListener("click", (event) => {
                const [width, height] = event.currentTarget.dataset.preset.split("x");
                this.canvasWidth.value = width;
                this.canvasHeight.value = height;
                doFastUpdate();
            });
        });

        this.btnSwapWh.addEventListener("click", () => {
            const width = this.canvasWidth.value;
            this.canvasWidth.value = this.canvasHeight.value;
            this.canvasHeight.value = width;
            doFastUpdate();
        });

        this.dropZone.addEventListener("click", (event) => {
            event.preventDefault();
            this.fileInput.click();
        });

        const preventDefaults = (event) => {
            event.preventDefault();
            event.stopPropagation();
        };

        ["dragenter", "dragover", "dragleave", "drop"].forEach((eventName) => {
            this.dropZone.addEventListener(eventName, preventDefaults, false);
        });

        const setDropZoneDragState = (isActive) => {
            this.dropZone.classList.toggle("is-dragover", isActive);
        };

        ["dragenter", "dragover"].forEach((eventName) => {
            this.dropZone.addEventListener(eventName, () => setDropZoneDragState(true));
        });

        ["dragleave", "drop"].forEach((eventName) => {
            this.dropZone.addEventListener(eventName, () => setDropZoneDragState(false));
        });

        this.dropZone.addEventListener("drop", (event) => {
            const transfer = event.dataTransfer;
            if (transfer && transfer.files && transfer.files.length > 0) {
                App.handleFile(transfer.files[0]);
            }
        });

        this.fileInput.addEventListener("change", (event) => {
            if (event.target.files && event.target.files.length > 0) {
                App.handleFile(event.target.files[0]);
                event.target.value = "";
            }
        });

        const triggerElements = [
            this.canvasWidth,
            this.canvasHeight,
            this.scaleSelect,
            this.invertCheck,
            this.invertBgCheck,
            this.optFormat,
            this.optDrawMode,
            this.previewTheme,
        ];

        triggerElements.forEach((element) => {
            element.addEventListener("change", () => {
                if (AppState.isUpdatingSliders) {
                    return;
                }
                App.requestPreviewCycle(PREVIEW_TIMING.fast);
            });
        });

        const doLiveSlider = () => {
            App.requestPreviewCycle(PREVIEW_TIMING.slider);
        };

        const resetSlider = (input, valueElement, defaultValue) => {
            input.value = String(defaultValue);
            valueElement.textContent = String(defaultValue);
            input.focus();
            doLiveSlider();
        };

        this.contrastInput.addEventListener("input", (event) => {
            this.contrastVal.textContent = event.target.value;
            doLiveSlider();
        });

        this.contrastInput.addEventListener("dblclick", () => {
            resetSlider(this.contrastInput, this.contrastVal, 0);
        });

        this.contrastVal.addEventListener("click", () => {
            resetSlider(this.contrastInput, this.contrastVal, 0);
        });

        this.thresholdInput.addEventListener("input", (event) => {
            this.thresholdVal.textContent = event.target.value;
            doLiveSlider();
        });

        this.thresholdInput.addEventListener("dblclick", () => {
            resetSlider(this.thresholdInput, this.thresholdVal, 128);
        });

        this.thresholdVal.addEventListener("click", () => {
            resetSlider(this.thresholdInput, this.thresholdVal, 128);
        });

        this.optVarName.addEventListener("input", () => {
            App.scheduleCommittedPreview(PREVIEW_TIMING.textCommit);
        });

        this.btnCopy.addEventListener("click", () => {
            if (!this.codeOutput.value) {
                return;
            }
            navigator.clipboard.writeText(this.codeOutput.value).then(() => {
                const originalHtml = this.btnCopy.innerHTML;
                this.btnCopy.textContent = "Copied!";
                setTimeout(() => {
                    this.btnCopy.innerHTML = originalHtml;
                }, 1500);
            });
        });

        this.btnDownload.addEventListener("click", () => {
            if (!this.codeOutput.value) {
                return;
            }

            const fileBlob = new Blob([this.codeOutput.value], { type: "text/plain" });
            const downloadUrl = createManagedObjectUrl(fileBlob);
            if (!downloadUrl) {
                return;
            }

            const link = document.createElement("a");
            link.href = downloadUrl;
            link.download = `${this.optVarName.value || "bitmap"}.h`;
            link.click();

            setTimeout(() => {
                revokeManagedObjectUrl(downloadUrl);
            }, 0);
        });

        if (this.appThemeToggle && UiThemeService && typeof UiThemeService.cycleMode === "function") {
            this.appThemeToggle.addEventListener("click", () => {
                const snapshot = UiThemeService.cycleMode();
                this.syncThemeToggle(snapshot);
            });
        }
    },

    syncThemeToggle(snapshot) {
        if (!this.appThemeToggle) {
            return;
        }

        const safeSnapshot = snapshot || {
            mode: "dark",
            resolvedTheme: "dark",
        };
        const mode = safeSnapshot.mode || "dark";
        const resolvedTheme = safeSnapshot.resolvedTheme || mode;
        const modeLabel = getAppThemeModeLabel(mode);
        const buttonText = `Theme: ${modeLabel}`;

        this.appThemeToggle.textContent = buttonText;
        this.appThemeToggle.dataset.themeMode = mode;
        this.appThemeToggle.dataset.themeResolved = resolvedTheme;
        this.appThemeToggle.title = `${buttonText} (${resolvedTheme})`;
        this.appThemeToggle.setAttribute("aria-label", `App theme mode: ${modeLabel} (${resolvedTheme})`);
    },
};

const App = {
    requestLivePreview() {
        if (AppState.livePreviewRafId !== null && AppState.livePreviewRafId !== undefined) {
            return;
        }

        if (typeof requestAnimationFrame !== "function") {
            this.updatePreview(true);
            return;
        }

        const rafId = requestAnimationFrame(() => {
            setAppStateValue("livePreviewRafId", null);
            this.updatePreview(true);
        });
        setAppStateValue("livePreviewRafId", rafId);
    },

    scheduleCommittedPreview(delay) {
        const commitDelay = Number.isFinite(Number(delay))
            ? Math.max(0, Number(delay))
            : PREVIEW_TIMING.standard;

        if (AppState.previewCommitTimer) {
            clearTimeout(AppState.previewCommitTimer);
        }

        const timerId = setTimeout(() => {
            setAppStateValue("previewCommitTimer", null);
            this.updatePreview(false);
        }, commitDelay);

        setAppStateValue("previewCommitTimer", timerId);
    },

    requestPreviewCycle(delay) {
        this.requestLivePreview();
        this.scheduleCommittedPreview(delay);
    },

    init() {
        let initialThemeSnapshot = null;
        if (UiThemeService && typeof UiThemeService.init === "function") {
            initialThemeSnapshot = UiThemeService.init();
        }

        UI.init();
        if (CustomSelectController && typeof CustomSelectController.init === "function") {
            CustomSelectController.init();
        }

        if (UiThemeService && typeof UiThemeService.subscribe === "function") {
            UiThemeService.subscribe((snapshot) => {
                UI.syncThemeToggle(snapshot);
            });
            UI.syncThemeToggle(initialThemeSnapshot || UiThemeService.getSnapshot());
        } else {
            UI.syncThemeToggle();
        }

        if (ActiveUrlManager) {
            window.addEventListener("beforeunload", () => {
                ActiveUrlManager.revokeAll();
            });
        }

        this.updatePreview();
    },

    handleFile(file) {
        clearScheduledPreview();

        const isSupportedImage = FileWorkflowService && typeof FileWorkflowService.isSupportedImage === "function"
            ? FileWorkflowService.isSupportedImage(file)
            : Boolean(file && typeof file.type === "string" && file.type.startsWith("image/"));

        if (!isSupportedImage) {
            alert("Only images are supported.");
            return;
        }

        if (ActiveUrlManager) {
            ActiveUrlManager.revokeAll();
        }

        const safeVarName = FileWorkflowService && typeof FileWorkflowService.getSafeVariableName === "function"
            ? FileWorkflowService.getSafeVariableName(file.name, "bitmap")
            : (file.name || "")
                .split(".")
                .slice(0, -1)
                .join(".")
                .replace(/[^a-zA-Z0-9_]/g, "_")
                .replace(/^[0-9]/, "_$&");
        if (safeVarName) {
            UI.optVarName.value = safeVarName;
        }

        patchAppStateValues({
            currentFrame: 0,
            isPaused: false,
        });

        if (AppState.gifTimer) {
            clearTimeout(AppState.gifTimer);
            setAppStateValue("gifTimer", null);
        }

        if (FileWorkflowService && typeof FileWorkflowService.loadFile === "function") {
            const loaded = FileWorkflowService.loadFile(file, () => this.updatePreview());
            if (!loaded) {
                alert("Unable to load this file.");
            }
            return;
        }

        if (file.type !== "image/gif") {
            const objectUrl = createManagedObjectUrl(file);
            if (!objectUrl) {
                return;
            }

            Processor.loadImage(objectUrl, () => {
                revokeManagedObjectUrl(objectUrl);
                this.updatePreview();
            });
            return;
        }

        if (typeof FileReader !== "function") {
            alert("FileReader is not available in this environment.");
            return;
        }

        const reader = new FileReader();
        reader.onload = (event) => {
            setTimeout(() => {
                try {
                    Processor.loadGif(event.target.result, () => this.updatePreview());
                } catch (error) {
                    console.error("GIF parsing failed. Falling back to static preview.", error);
                    const fallbackUrl = createManagedObjectUrl(file);
                    if (!fallbackUrl) {
                        return;
                    }

                    Processor.loadImage(fallbackUrl, () => {
                        revokeManagedObjectUrl(fallbackUrl);
                        this.updatePreview();
                    });
                }
            }, 10);
        };
        reader.readAsArrayBuffer(file);
    },

    getUiTuningSnapshot() {
        return {
            contrast: UI.contrastInput.value,
            threshold: UI.thresholdInput.value,
            invert: UI.invertCheck.checked,
            invertBg: UI.invertBgCheck.checked,
        };
    },

    getSettings(frameIndex = -1) {
        const baseRaw = {
            width: UI.canvasWidth.value,
            height: UI.canvasHeight.value,
            scale: UI.scaleSelect.value,
            contrast: UI.contrastInput.value,
            threshold: UI.thresholdInput.value,
            processingMethod: "threshold",
            invert: UI.invertCheck.checked,
            invertBg: UI.invertBgCheck.checked,
            flipH: AppState.tFlipH,
            flipV: AppState.tFlipV,
            rotate: AppState.tRotate,
            outputFormat: UI.optFormat.value,
            drawMode: UI.optDrawMode.value,
            varName: UI.optVarName.value || "bitmap",
            theme: UI.previewTheme.value,
        };

        const base = SettingsContract && typeof SettingsContract.normalizeSettings === "function"
            ? SettingsContract.normalizeSettings(baseRaw)
            : {
                width: parseInt(UI.canvasWidth.value, 10) || 128,
                height: parseInt(UI.canvasHeight.value, 10) || 64,
                scale: UI.scaleSelect.value,
                contrast: parseInt(UI.contrastInput.value, 10),
                threshold: parseInt(UI.thresholdInput.value, 10),
                processingMethod: "threshold",
                dither: false,
                invert: UI.invertCheck.checked,
                invertBg: UI.invertBgCheck.checked,
                flipH: AppState.tFlipH,
                flipV: AppState.tFlipV,
                rotate: AppState.tRotate,
                outputFormat: UI.optFormat.value,
                drawMode: UI.optDrawMode.value,
                varName: UI.optVarName.value || "bitmap",
                theme: UI.previewTheme.value,
            };

        if (
            Processor.sourceIsGif &&
            frameIndex >= 0 &&
            Processor.gifFrames[frameIndex] &&
            Processor.gifFrames[frameIndex].tuning
        ) {
            if (SettingsContract && typeof SettingsContract.mergeFrameTuning === "function") {
                return SettingsContract.mergeFrameTuning(base, Processor.gifFrames[frameIndex].tuning);
            }

            return Object.assign({}, base, Processor.gifFrames[frameIndex].tuning);
        }

        return base;
    },

    applyFrameSlidersToUI(index) {
        if (!Processor.sourceIsGif || !Processor.gifFrames[index]) {
            return;
        }

        setAppStateValue("isUpdatingSliders", true);

        const tuning = FrameTuningManager && typeof FrameTuningManager.readFrameTuning === "function"
            ? FrameTuningManager.readFrameTuning(Processor.gifFrames[index])
            : (Processor.gifFrames[index].tuning || {});

        UI.contrastInput.value = tuning.contrast !== undefined ? tuning.contrast : 0;
        UI.contrastVal.textContent = UI.contrastInput.value;
        UI.thresholdInput.value = tuning.threshold !== undefined ? tuning.threshold : 128;
        UI.thresholdVal.textContent = UI.thresholdInput.value;
        UI.invertCheck.checked = tuning.invert !== undefined ? tuning.invert : false;
        UI.invertBgCheck.checked = tuning.invertBg !== undefined ? tuning.invertBg : false;

        setAppStateValue("isUpdatingSliders", false);
    },

    setActiveTimelineEntry(activeIndex) {
        if (PreviewService && typeof PreviewService.setTimelineActive === "function") {
            PreviewService.setTimelineActive(UI.timeline, activeIndex);
            return;
        }

        Array.from(UI.timeline.children).forEach((element, index) => {
            element.classList.toggle("active", index === activeIndex);
        });
    },

    syncPresetButtons(settings) {
        if (PreviewService && typeof PreviewService.setPresetActiveButtons === "function") {
            PreviewService.setPresetActiveButtons(UI.presetBtns, settings.width, settings.height);
            return;
        }

        UI.presetBtns.forEach((button) => {
            const [width, height] = button.dataset.preset.split("x");
            const isActive =
                parseInt(width, 10) === settings.width &&
                parseInt(height, 10) === settings.height;
            button.classList.toggle("active", isActive);
        });
    },

    syncPreviewSurface(settings) {
        if (PreviewService && typeof PreviewService.syncPreviewSurface === "function") {
            PreviewService.syncPreviewSurface(
                UI.previewCanvas,
                UI.timeline,
                Processor.sourceIsGif,
                settings.width,
                settings.height,
            );
            return;
        }

        UI.previewCanvas.width = settings.width;
        UI.previewCanvas.height = settings.height;
        UI.previewCanvas.classList.toggle("is-gif", Processor.sourceIsGif);
        UI.timeline.classList.toggle("is-hidden", !Processor.sourceIsGif);
    },

    renderToCanvas(canvas, source, settings, options) {
        if (PreviewService && typeof PreviewService.renderToCanvas === "function") {
            return PreviewService.renderToCanvas(canvas, source, settings, options);
        }

        return Processor.processFrame(canvas, source, settings, options);
    },

    renderSingleThumbnail(index) {
        if (GifWorkflowService && typeof GifWorkflowService.renderSingleThumbnail === "function") {
            const rendered = GifWorkflowService.renderSingleThumbnail({
                timeline: UI.timeline,
                frames: Processor.gifFrames,
                index,
                getSettings: (frameIndex) => this.getSettings(frameIndex),
                renderToCanvas: (canvas, source, settings) => this.renderToCanvas(
                    canvas,
                    source,
                    settings,
                    PREVIEW_RENDER_OPTIONS,
                ),
            });
            if (rendered) {
                return;
            }
        }

        if (UI.timeline.children.length <= index + 1) {
            return;
        }

        const thumb = UI.timeline.children[index + 1].querySelector("canvas");
        if (thumb) {
            this.renderToCanvas(
                thumb,
                Processor.gifFrames[index].imgData,
                this.getSettings(index),
                PREVIEW_RENDER_OPTIONS,
            );
        }
    },

    playGif() {
        if (prefersReducedMotion()) {
            setAppStateValue("isPaused", true);
            return;
        }

        if (GifWorkflowService && typeof GifWorkflowService.startPlayback === "function") {
            GifWorkflowService.startPlayback({
                appState: AppState,
                setStateValue: (key, value) => setAppStateValue(key, value),
                processor: Processor,
                getSettings: (frameIndex) => this.getSettings(frameIndex),
                renderToCanvas: (canvas, source, settings) => this.renderToCanvas(
                    canvas,
                    source,
                    settings,
                    PREVIEW_RENDER_OPTIONS,
                ),
                previewCanvas: UI.previewCanvas,
                previewInfo: UI.previewInfo,
                setActiveTimelineEntry: (activeIndex) => this.setActiveTimelineEntry(activeIndex),
            });
            return;
        }

        if (AppState.gifTimer) {
            clearTimeout(AppState.gifTimer);
            setAppStateValue("gifTimer", null);
        }

        const normalizeFrameIndex = (index, length) => {
            if (!Number.isInteger(index) || length <= 0) {
                return 0;
            }

            return ((index % length) + length) % length;
        };

        const renderNextFrame = (requestedIndex) => {
            if (!Processor.sourceIsGif) {
                return;
            }

            const frameCount = Processor.gifFrames.length;
            if (frameCount === 0) {
                setAppStateValue("gifTimer", null);
                return;
            }

            if (!AppState.isPaused) {
                const frameIndex = normalizeFrameIndex(requestedIndex, frameCount);
                const frame = Processor.gifFrames[frameIndex];
                setAppStateValue("currentFrame", frameIndex);

                const settings = this.getSettings(frameIndex);

                this.renderToCanvas(UI.previewCanvas, frame.imgData, settings, PREVIEW_RENDER_OPTIONS);
                UI.previewInfo.textContent = `${settings.width} × ${settings.height} | GIF: ${frameIndex + 1}/${frameCount} fr`;

                this.setActiveTimelineEntry(0);

                let delay = frame.delay * 10 || 100;
                if (delay < 20) {
                    delay = 100;
                }

                const nextFrame = (frameIndex + 1) % frameCount;
                setAppStateValue("gifTimer", setTimeout(() => {
                    renderNextFrame(nextFrame);
                }, delay));
            } else {
                const frameIndex = normalizeFrameIndex(AppState.currentFrame, frameCount);
                const settings = this.getSettings(frameIndex);
                UI.previewInfo.textContent = `${settings.width} × ${settings.height} | GIF: ${frameIndex + 1}/${frameCount} fr (Paused)`;
                setAppStateValue("gifTimer", null);
            }
        };

        renderNextFrame(AppState.currentFrame);
    },

    updatePreview(isLive = false) {
        if (AppState.isUpdatingSliders || AppState.isRendering) {
            return;
        }
        setAppStateValue("isRendering", true);
        try {
            if (prefersReducedMotion() && Processor.sourceIsGif && !AppState.isPaused) {
                setAppStateValue("isPaused", true);
            }

            const currentSettings = this.getSettings(AppState.isPaused ? AppState.currentFrame : -1);

            this.syncPresetButtons(currentSettings);

            UI.previewInfo.textContent = `${currentSettings.width} × ${currentSettings.height}`;

            if (!Processor.sourceImage) {
                return;
            }

            const globalSettings = this.getSettings(-1);

            this.syncPreviewSurface(currentSettings);

            if (Processor.sourceIsGif) {
                const uiTuning = this.getUiTuningSnapshot();

                if (GifWorkflowService && typeof GifWorkflowService.applyUiTuning === "function") {
                    GifWorkflowService.applyUiTuning({
                        frames: Processor.gifFrames,
                        isPaused: AppState.isPaused,
                        currentFrame: AppState.currentFrame,
                        uiTuning,
                    });
                } else if (AppState.isPaused) {
                    const activeFrame = Processor.gifFrames[AppState.currentFrame];
                    if (FrameTuningManager && typeof FrameTuningManager.applyUiTuningToFrame === "function") {
                        FrameTuningManager.applyUiTuningToFrame(activeFrame, uiTuning);
                    } else if (activeFrame) {
                        activeFrame.tuning = Object.assign({}, activeFrame.tuning || {}, uiTuning);
                    }
                } else {
                    if (FrameTuningManager && typeof FrameTuningManager.applyUiTuningToFrames === "function") {
                        FrameTuningManager.applyUiTuningToFrames(Processor.gifFrames, uiTuning);
                    } else {
                        Processor.gifFrames.forEach((frame) => {
                            frame.tuning = Object.assign({}, frame.tuning || {}, uiTuning);
                        });
                    }
                }

                const needsRebuild = GifWorkflowService && typeof GifWorkflowService.needsTimelineRebuild === "function"
                    ? GifWorkflowService.needsTimelineRebuild({
                        timeline: UI.timeline,
                        currentSettings,
                        lastW: AppState.lastW,
                        lastH: AppState.lastH,
                        lastScale: AppState.lastScale,
                    })
                    : (
                        UI.timeline.children.length === 0 ||
                        currentSettings.width !== AppState.lastW ||
                        currentSettings.height !== AppState.lastH ||
                        currentSettings.scale !== AppState.lastScale
                    );

                if (needsRebuild) {
                    if (GifWorkflowService && typeof GifWorkflowService.rebuildTimeline === "function") {
                        GifWorkflowService.rebuildTimeline({
                            timeline: UI.timeline,
                            frames: Processor.gifFrames,
                            isPaused: AppState.isPaused,
                            currentFrame: AppState.currentFrame,
                            currentSettings,
                            getSettings: (frameIndex) => this.getSettings(frameIndex),
                            renderToCanvas: (canvas, source, settings) => this.renderToCanvas(
                                canvas,
                                source,
                                settings,
                                PREVIEW_RENDER_OPTIONS,
                            ),
                            onPlayAll: () => {
                                setAppStateValue("isPaused", false);
                                this.applyFrameSlidersToUI(0);
                                this.requestPreviewCycle(PREVIEW_TIMING.standard);
                            },
                            onSelectFrame: (index, frame) => {
                                patchAppStateValues({
                                    isPaused: true,
                                    currentFrame: index,
                                });
                                this.applyFrameSlidersToUI(index);
                                this.renderToCanvas(
                                    UI.previewCanvas,
                                    frame.imgData,
                                    this.getSettings(index),
                                    PREVIEW_RENDER_OPTIONS,
                                );

                                this.setActiveTimelineEntry(index + 1);

                                this.scheduleCommittedPreview(PREVIEW_TIMING.standard);
                            },
                        });
                    } else {
                        UI.timeline.innerHTML = "";
                    }
                } else {
                    if (GifWorkflowService && typeof GifWorkflowService.refreshTimelineThumbnails === "function") {
                        GifWorkflowService.refreshTimelineThumbnails({
                            timeline: UI.timeline,
                            frames: Processor.gifFrames,
                            isPaused: AppState.isPaused,
                            currentFrame: AppState.currentFrame,
                            isLive,
                            getSettings: (frameIndex) => this.getSettings(frameIndex),
                            renderToCanvas: (canvas, source, settings) => this.renderToCanvas(
                                canvas,
                                source,
                                settings,
                                PREVIEW_RENDER_OPTIONS,
                            ),
                            requestFrame: typeof requestAnimationFrame === "function"
                                ? requestAnimationFrame
                                : null,
                        });
                    } else if (AppState.isPaused) {
                        this.renderSingleThumbnail(AppState.currentFrame);
                    } else if (!isLive) {
                        for (let i = 0; i < Processor.gifFrames.length; i += 1) {
                            this.renderSingleThumbnail(i);
                        }

                        const animationCanvas = UI.timeline.children[0]?.querySelector("canvas");
                        if (animationCanvas) {
                            this.renderToCanvas(
                                animationCanvas,
                                Processor.gifFrames[0].imgData,
                                this.getSettings(0),
                                PREVIEW_RENDER_OPTIONS,
                            );
                        }
                    }
                }

                if (AppState.isPaused) {
                    this.renderToCanvas(
                        UI.previewCanvas,
                        Processor.gifFrames[AppState.currentFrame].imgData,
                        this.getSettings(AppState.currentFrame),
                        PREVIEW_RENDER_OPTIONS,
                    );

                    this.setActiveTimelineEntry(AppState.currentFrame + 1);
                } else if (!AppState.gifTimer) {
                    this.playGif();
                }

                patchAppStateValues({
                    lastW: currentSettings.width,
                    lastH: currentSettings.height,
                    lastScale: currentSettings.scale,
                });
            } else {
                this.renderToCanvas(UI.previewCanvas, Processor.sourceImage, currentSettings, PREVIEW_RENDER_OPTIONS);
            }

            if (!isLive) {
                UI.codeOutput.value = Generator.generate(globalSettings);
            }
        } finally {
            setAppStateValue("isRendering", false);
        }
    },
};

document.addEventListener("DOMContentLoaded", () => App.init());

/**
 * Image2Cpp Main Controller
 * Slim ES-module controller wires implementations together
 */

import { normalizeSettings, mergeFrameTuning } from "./core/settings.js";
import { processFrame } from "./imaging/processor.js";
import { generate } from "./codegen/generator.js";
import { parseByteArrayText, bytesToImageData } from "./imaging/reverse.js";
import * as CustomSelect from "./ui/custom-select.js";
import { createThemeController } from "./ui/theme.js";
import * as PreviewView from "./ui/preview-view.js";
import * as Timeline from "./ui/timeline-view.js";
import * as Frames from "./workflow/frames.js";
import { ingestFiles, safeVarNameFromFiles } from "./workflow/ingest.js";
import { createObjectUrl, revokeObjectUrl, revokeAll } from "./workflow/object-urls.js";

const PREVIEW_RENDER_OPTIONS = { skipBinary: true };
const PREVIEW_TIMING = { fast: 60, standard: 90, slider: 130, textCommit: 140 };

const state = {
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

const UiTheme = createThemeController({
    storageKey: "image2cpp.uiThemeMode",
    attributeName: "data-app-theme",
    defaultMode: "system",
    modeSequence: ["system", "light", "dark"],
});

const APP_THEME_MODE_LABELS = { system: "System", light: "Light", dark: "Dark" };

function getAppThemeModeLabel(mode) {
    return APP_THEME_MODE_LABELS[mode] || APP_THEME_MODE_LABELS.dark;
}

function prefersReducedMotion() {
    return typeof window !== "undefined"
        && typeof window.matchMedia === "function"
        && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function clearScheduledPreview() {
    if (state.previewCommitTimer) { clearTimeout(state.previewCommitTimer); state.previewCommitTimer = null; }
    if (state.livePreviewRafId != null && typeof cancelAnimationFrame === "function") {
        cancelAnimationFrame(state.livePreviewRafId);
        state.livePreviewRafId = null;
    }
}

const UI = {
    init() {
        this.appHeader = document.querySelector(".app-header");
        this.dropZone = document.getElementById("drop-zone");
        this.fileInput = document.getElementById("file-input");
        this.inputModeToggle = document.getElementById("input-mode-toggle");
        this.paneUpload = document.getElementById("pane-upload");
        this.panePaste = document.getElementById("pane-paste");
        this.pasteInput = document.getElementById("paste-input");
        this.pasteError = document.getElementById("paste-error");
        this.btnReadH = document.getElementById("btn-read-h");
        this.btnReadV = document.getElementById("btn-read-v");
        this.canvasWidth = document.getElementById("canvas-width");
        this.canvasHeight = document.getElementById("canvas-height");
        this.btnSwapWh = document.getElementById("btn-swap-wh");
        this.scaleSelect = document.getElementById("setting-scale");
        this.smoothScaleCheck = document.getElementById("setting-smooth");

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
        this.optPixelFormat = document.getElementById("pixel-format");
        this.optDither = document.getElementById("dither-mode");
        this.bitSwapCheck = document.getElementById("setting-bitswap");
        this.bitSwapWrap = document.getElementById("wrap-bitswap");
        this.ditherGroup = document.getElementById("group-dither");

        // Start with bit-swap off (after the element is cached).
        if (this.bitSwapCheck) {
            this.bitSwapCheck.checked = false;
        }
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
            document.fonts.ready.then(this.syncLayoutMetrics).catch(() => { });
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
            state.tFlipH = !state.tFlipH;
            doFastUpdate();
        });

        this.btnFlipV.addEventListener("click", () => {
            state.tFlipV = !state.tFlipV;
            doFastUpdate();
        });

        this.btnRotate.addEventListener("click", () => {
            state.tRotate = (state.tRotate + 90) % 360;
            doFastUpdate();
        });

        this.previewCanvas.addEventListener("click", () => {
            if (Frames.isMultiFrame()) {
                state.isPaused = !state.isPaused;
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
                App.handleFiles(transfer.files);
            }
        });

        this.fileInput.addEventListener("change", (event) => {
            if (event.target.files && event.target.files.length > 0) {
                App.handleFiles(event.target.files);
                event.target.value = "";
            }
        });

        this.inputModeToggle.querySelectorAll(".action-btn").forEach((btn) => {
            btn.addEventListener("click", () => {
                const mode = btn.dataset.mode;
                this.inputModeToggle.querySelectorAll(".action-btn")
                    .forEach((b) => b.classList.toggle("active", b === btn));
                this.paneUpload.classList.toggle("is-hidden", mode !== "upload");
                this.panePaste.classList.toggle("is-hidden", mode !== "paste");
            });
        });

        const readPasted = (orientation) => App.handlePastedArray(orientation);
        this.btnReadH.addEventListener("click", () => readPasted("horizontal"));
        this.btnReadV.addEventListener("click", () => readPasted("vertical"));

        const triggerElements = [
            this.canvasWidth,
            this.canvasHeight,
            this.scaleSelect,
            this.smoothScaleCheck,
            this.invertCheck,
            this.invertBgCheck,
            this.optFormat,
            this.optDrawMode,
            this.optPixelFormat,
            this.optDither,
            this.bitSwapCheck,
            this.previewTheme,
        ];

        triggerElements.forEach((element) => {
            element.addEventListener("change", () => {
                if (element === this.optPixelFormat) {
                    App.reconcileControls();
                }

                if (state.isUpdatingSliders) {
                    return;
                }

                App.requestPreviewCycle(PREVIEW_TIMING.fast);
            });
        });

        const doLiveSlider = () => {
            App.requestPreviewCycle(PREVIEW_TIMING.slider);
        };

        const resetSlider = (input, valueElement, defaultValue) => {
            if (input.disabled) {
                return;
            }
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
            const downloadUrl = createObjectUrl(fileBlob);
            if (!downloadUrl) {
                return;
            }

            const link = document.createElement("a");
            link.href = downloadUrl;
            link.download = `${this.optVarName.value || "byte array"}.h`;
            link.click();

            setTimeout(() => {
                revokeObjectUrl(downloadUrl);
            }, 0);
        });

        this.appThemeToggle.addEventListener("click", () => {
            UI.syncThemeToggle(UiTheme.cycleMode());
        });
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
        this.appThemeToggle.setAttribute("aria-label", `Theme: ${modeLabel} (${resolvedTheme})`);
    },
};

const App = {
    requestLivePreview() {
        if (state.livePreviewRafId !== null && state.livePreviewRafId !== undefined) {
            return;
        }

        if (typeof requestAnimationFrame !== "function") {
            this.updatePreview(true);
            return;
        }

        const rafId = requestAnimationFrame(() => {
            state.livePreviewRafId = null;
            this.updatePreview(true);
        });
        state.livePreviewRafId = rafId;
    },

    scheduleCommittedPreview(delay) {
        const commitDelay = Number.isFinite(Number(delay))
            ? Math.max(0, Number(delay))
            : PREVIEW_TIMING.standard;

        if (state.previewCommitTimer) {
            clearTimeout(state.previewCommitTimer);
        }

        const timerId = setTimeout(() => {
            state.previewCommitTimer = null;
            this.updatePreview(false);
        }, commitDelay);

        state.previewCommitTimer = timerId;
    },

    requestPreviewCycle(delay) {
        this.requestLivePreview();
        this.scheduleCommittedPreview(delay);
    },

    init() {
        const initialThemeSnapshot = UiTheme.init();
        UI.init();
        CustomSelect.init();
        this.reconcileControls();
        UiTheme.subscribe((snapshot) => UI.syncThemeToggle(snapshot));
        UI.syncThemeToggle(initialThemeSnapshot || UiTheme.getSnapshot());
        window.addEventListener("beforeunload", () => revokeAll());
        this.updatePreview();
    },

    async handleFiles(fileList) {
        clearScheduledPreview();
        const files = Array.from(fileList || []);
        if (files.length === 0) return;
        if (!files.every((f) => f && typeof f.type === "string" && f.type.startsWith("image/"))) {
            alert("Only image files are supported.");
            return;
        }
        const safeName = safeVarNameFromFiles(files);
        if (safeName) UI.optVarName.value = safeName;
        Object.assign(state, { currentFrame: 0, isPaused: false });
        if (state.gifTimer) { clearTimeout(state.gifTimer); state.gifTimer = null; }
        try {
            const frames = await ingestFiles(files);
            if (frames.length === 0) { alert("Unable to load these files."); return; }
            Frames.setFrames(frames);
            this.updatePreview();
        } catch (err) {
            console.error(err);
            alert("Unable to load these files.");
        }
    },

    handlePastedArray(orientation) {
        UI.pasteError.classList.add("is-hidden");
        const width = parseInt(UI.canvasWidth.value, 10) || 128;
        const height = parseInt(UI.canvasHeight.value, 10) || 64;
        try {
            const tokens = parseByteArrayText(UI.pasteInput.value);
            if (tokens.length === 0) throw new Error("empty");
            const imageData = bytesToImageData(tokens, width, height, orientation);
            Object.assign(state, { currentFrame: 0, isPaused: false });
            if (state.gifTimer) { clearTimeout(state.gifTimer); state.gifTimer = null; }
            Frames.setFrames([{ source: imageData, name: UI.optVarName.value || "byte array", delayMs: 0 }]);
            this.updatePreview();
        } catch (err) {
            UI.pasteError.classList.remove("is-hidden");
        }
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
            smoothScaling: UI.smoothScaleCheck ? UI.smoothScaleCheck.checked : true,
            contrast: UI.contrastInput.value,
            threshold: UI.thresholdInput.value,
            dither: UI.optDither ? UI.optDither.value : "binary",
            pixelFormat: UI.optPixelFormat ? UI.optPixelFormat.value : "mono1",
            bitSwap: UI.bitSwapCheck ? UI.bitSwapCheck.checked : false,
            invert: UI.invertCheck.checked,
            invertBg: UI.invertBgCheck.checked,
            flipH: state.tFlipH,
            flipV: state.tFlipV,
            rotate: state.tRotate,
            outputFormat: UI.optFormat.value,
            drawMode: UI.optDrawMode.value,
            varName: UI.optVarName.value || "byte array",
            theme: UI.previewTheme.value,
        };

        const base = normalizeSettings(baseRaw);

        const frame = frameIndex >= 0 ? Frames.getFrames()[frameIndex] : null;
        if (Frames.isMultiFrame() && frame && frame.tuning) {
            return mergeFrameTuning(base, frame.tuning);
        }

        return base;
    },

    applyFrameSlidersToUI(index) {
        const frame = Frames.getFrames()[index];
        if (!Frames.isMultiFrame() || !frame) {
            return;
        }

        state.isUpdatingSliders = true;

        const tuning = Frames.readFrameTuning(frame);

        UI.contrastInput.value = tuning.contrast !== undefined ? tuning.contrast : 0;
        UI.contrastVal.textContent = UI.contrastInput.value;
        UI.thresholdInput.value = tuning.threshold !== undefined ? tuning.threshold : 128;
        UI.thresholdVal.textContent = UI.thresholdInput.value;
        UI.invertCheck.checked = tuning.invert !== undefined ? tuning.invert : false;
        UI.invertBgCheck.checked = tuning.invertBg !== undefined ? tuning.invertBg : false;

        state.isUpdatingSliders = false;
    },

    setActiveTimelineEntry(activeIndex) {
        PreviewView.setTimelineActive(UI.timeline, activeIndex);
    },

    syncPresetButtons(settings) {
        PreviewView.setPresetActiveButtons(UI.presetBtns, settings.width, settings.height);
    },

    syncPreviewSurface(settings) {
        PreviewView.syncPreviewSurface(
            UI.previewCanvas,
            UI.timeline,
            Frames.isMultiFrame(),
            settings.width,
            settings.height,
        );
    },

    renderSingleThumbnail(index) {
        Timeline.renderSingleThumbnail({
            timeline: UI.timeline,
            frames: Frames.getFrames(),
            index,
            getSettings: (frameIndex) => this.getSettings(frameIndex),
            renderToCanvas: (canvas, source, settings) => processFrame(
                canvas,
                source,
                settings,
                PREVIEW_RENDER_OPTIONS,
            ),
        });
    },

    playGif() {
        if (prefersReducedMotion()) {
            state.isPaused = true;
            return;
        }

        Timeline.startPlayback({
            appState: state,
            setStateValue: (key, value) => { state[key] = value; },
            getSettings: (frameIndex) => this.getSettings(frameIndex),
            renderToCanvas: (canvas, source, settings) => processFrame(
                canvas,
                source,
                settings,
                PREVIEW_RENDER_OPTIONS,
            ),
            previewCanvas: UI.previewCanvas,
            previewInfo: UI.previewInfo,
            setActiveTimelineEntry: (activeIndex) => this.setActiveTimelineEntry(activeIndex),
        });
    },

    setControlDisabled(element, disabled, wrapTarget) {
        if (!element) {
            return;
        }
        if (element.classList && element.classList.contains("custom-select")) {
            element.disabled = disabled;
            const wrapper = element.nextElementSibling;
            if (wrapper && wrapper.classList.contains("custom-select-wrapper")) {
                wrapper.classList.toggle("is-disabled", disabled);
                const trigger = wrapper.querySelector(".custom-select-trigger");
                if (trigger) {
                    trigger.setAttribute("aria-disabled", disabled ? "true" : "false");
                    trigger.tabIndex = disabled ? -1 : 0;
                }
            }
            return;
        }
        element.disabled = disabled;
        const target = wrapTarget || (element.closest ? element.closest(".setting-group") : null);
        if (target) {
            target.classList.toggle("is-disabled", disabled);
        }
    },

    setCustomSelectValue(select, value) {
        if (!select) {
            return;
        }
        const index = Array.from(select.options).findIndex((option) => option.value === value);
        if (index < 0) {
            return;
        }
        const wrapper = select.nextElementSibling;
        if (wrapper && wrapper.classList.contains("custom-select-wrapper")) {
            CustomSelect.setIndex(select, wrapper, index, false);
        } else {
            select.selectedIndex = index;
        }
    },

    reconcileControls() {
        const format = UI.optPixelFormat ? UI.optPixelFormat.value : "mono1";
        const isMono = format === "mono1";
        const isAlpha = format === "alpha";
        const isColor = format === "rgb565" || format === "rgb888";

        if (!isMono && UI.optDrawMode && UI.optDrawMode.value !== "horizontal") {
            this.setCustomSelectValue(UI.optDrawMode, "horizontal");
        }

        this.setControlDisabled(UI.optDrawMode, !isMono);
        this.setControlDisabled(UI.optDither, !isMono, UI.ditherGroup);
        this.setControlDisabled(UI.thresholdInput, isColor, UI.thresholdInput.closest(".setting-group"));
        this.setControlDisabled(UI.contrastInput, isAlpha, UI.contrastInput.closest(".setting-group"));
        this.setControlDisabled(UI.bitSwapCheck, isColor, UI.bitSwapWrap);
    },

    updatePreview(isLive = false) {
        if (state.isUpdatingSliders || state.isRendering) {
            return;
        }
        state.isRendering = true;
        try {
            if (prefersReducedMotion() && Frames.isMultiFrame() && !state.isPaused) {
                state.isPaused = true;
            }

            const currentSettings = this.getSettings(state.isPaused ? state.currentFrame : -1);

            this.syncPresetButtons(currentSettings);

            UI.previewInfo.textContent = `${currentSettings.width} × ${currentSettings.height}`;

            if (!Frames.hasFrames()) {
                return;
            }

            const globalSettings = this.getSettings(-1);

            this.syncPreviewSurface(currentSettings);

            if (Frames.isMultiFrame()) {
                const uiTuning = this.getUiTuningSnapshot();

                Timeline.applyUiTuning({
                    frames: Frames.getFrames(),
                    isPaused: state.isPaused,
                    currentFrame: state.currentFrame,
                    uiTuning,
                });

                const needsRebuild = Timeline.needsTimelineRebuild({
                    timeline: UI.timeline,
                    currentSettings,
                    lastW: state.lastW,
                    lastH: state.lastH,
                    lastScale: state.lastScale,
                });

                if (needsRebuild) {
                    Timeline.rebuildTimeline({
                        timeline: UI.timeline,
                        frames: Frames.getFrames(),
                        isPaused: state.isPaused,
                        currentFrame: state.currentFrame,
                        currentSettings,
                        getSettings: (frameIndex) => this.getSettings(frameIndex),
                        renderToCanvas: (canvas, source, settings) => processFrame(
                            canvas,
                            source,
                            settings,
                            PREVIEW_RENDER_OPTIONS,
                        ),
                        onPlayAll: () => {
                            state.isPaused = false;
                            this.applyFrameSlidersToUI(0);
                            this.requestPreviewCycle(PREVIEW_TIMING.standard);
                        },
                        onSelectFrame: (index, frame) => {
                            Object.assign(state, {
                                isPaused: true,
                                currentFrame: index,
                            });
                            this.applyFrameSlidersToUI(index);
                            processFrame(
                                UI.previewCanvas,
                                frame.source,
                                this.getSettings(index),
                                PREVIEW_RENDER_OPTIONS,
                            );

                            this.setActiveTimelineEntry(index + 1);

                            this.scheduleCommittedPreview(PREVIEW_TIMING.standard);
                        },
                    });
                } else {
                    Timeline.refreshTimelineThumbnails({
                        timeline: UI.timeline,
                        frames: Frames.getFrames(),
                        isPaused: state.isPaused,
                        currentFrame: state.currentFrame,
                        isLive,
                        getSettings: (frameIndex) => this.getSettings(frameIndex),
                        renderToCanvas: (canvas, source, settings) => processFrame(
                            canvas,
                            source,
                            settings,
                            PREVIEW_RENDER_OPTIONS,
                        ),
                        requestFrame: typeof requestAnimationFrame === "function"
                            ? requestAnimationFrame
                            : null,
                    });
                }

                if (state.isPaused) {
                    processFrame(
                        UI.previewCanvas,
                        Frames.getFrames()[state.currentFrame].source,
                        this.getSettings(state.currentFrame),
                        PREVIEW_RENDER_OPTIONS,
                    );

                    this.setActiveTimelineEntry(state.currentFrame + 1);
                } else if (!state.gifTimer) {
                    this.playGif();
                }

                Object.assign(state, {
                    lastW: currentSettings.width,
                    lastH: currentSettings.height,
                    lastScale: currentSettings.scale,
                });
            } else {
                processFrame(UI.previewCanvas, Frames.getFrames()[0].source, currentSettings, PREVIEW_RENDER_OPTIONS);
            }

            if (!isLive) {
                UI.codeOutput.value = generate(globalSettings);
            }
        } finally {
            state.isRendering = false;
        }
    },
};

document.addEventListener("DOMContentLoaded", () => App.init());

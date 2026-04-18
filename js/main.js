
/**
 * Image2Cpp Main Controller
 * Follows modular initialization and separated state management.
 */

const AppState = {
    gifTimer: null,
    currentFrame: 0,
    isPaused: false,
    tFlipH: false,
    tFlipV: false,
    tRotate: 0,
    lastW: 0,
    lastH: 0,
    lastScale: "",
    isUpdatingSliders: false,
};

const UI = {
    init() {
        this.dropZone = document.getElementById("drop-zone");
        this.fileInput = document.getElementById("file-input");
        this.canvasWidth = document.getElementById("canvas-width");
        this.canvasHeight = document.getElementById("canvas-height");
        this.btnSwapWh = document.getElementById("btn-swap-wh");
        this.scaleSelect = document.getElementById("setting-scale");
        
        this.brightnessInput = document.getElementById("setting-brightness");
        this.brightnessVal = document.getElementById("brightness-val");
        this.contrastInput = document.getElementById("setting-contrast");
        this.contrastVal = document.getElementById("contrast-val");
        this.thresholdInput = document.getElementById("setting-threshold");
        this.thresholdVal = document.getElementById("threshold-val");

        this.ditherCheck = document.getElementById("setting-dither");
        this.invertCheck = document.getElementById("setting-invert");
        this.invertBgCheck = document.getElementById("setting-invert-bg");
        this.optFormat = document.getElementById("output-format");
        this.optDrawMode = document.getElementById("draw-mode");
        this.optVarName = document.getElementById("var-name");
        this.previewTheme = document.getElementById("preview-theme");
        
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
        
        this.bindEvents();
    },

    bindEvents() {
        // Horizontal scroll for gif frames timeline using vertical wheel
        this.timeline.addEventListener('wheel', (e) => {
            if (e.deltaY !== 0) {
                e.preventDefault();
                this.timeline.scrollLeft += e.deltaY;
            }
        });

        // Transforms
        this.btnFlipH.addEventListener("click", () => { AppState.tFlipH = !AppState.tFlipH; App.updatePreview(); });
        this.btnFlipV.addEventListener("click", () => { AppState.tFlipV = !AppState.tFlipV; App.updatePreview(); });
        this.btnRotate.addEventListener("click", () => { AppState.tRotate = (AppState.tRotate + 90) % 360; App.updatePreview(); });

        // Pause toggle
        this.previewCanvas.addEventListener("click", () => {
            if(Processor.sourceIsGif) {
                AppState.isPaused = !AppState.isPaused;
                App.updatePreview(); // Re-render to show correct active state
            }
        });

        // Presets
        this.presetBtns.forEach(btn => {
            btn.addEventListener("click", (e) => {
                const [w, h] = e.target.dataset.preset.split('x');
                this.canvasWidth.value = w;
                this.canvasHeight.value = h;
                App.updatePreview();
            });
        });

        // Swap W/H
        this.btnSwapWh.addEventListener("click", () => {
            const w = this.canvasWidth.value;
            this.canvasWidth.value = this.canvasHeight.value;
            this.canvasHeight.value = w;
            App.updatePreview();
        });

        // Isolated & Defused File Upload Logic
        this.dropZone.addEventListener('click', (e) => {
            e.preventDefault();
            this.fileInput.click();
        });

        // Setup Drag & Drop Visuals
        const preventDefaults = (e) => { e.preventDefault(); e.stopPropagation(); };
        
        ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
            this.dropZone.addEventListener(eventName, preventDefaults, false);
        });

        this.dropZone.addEventListener('dragover', () => { 
            this.dropZone.style.borderColor = "var(--accent)"; 
            this.dropZone.style.background = "var(--surface-hover)";
        });

        this.dropZone.addEventListener('dragleave', () => { 
            this.dropZone.style.borderColor = ""; 
            this.dropZone.style.background = "";
        });

        this.dropZone.addEventListener('drop', (e) => {
            this.dropZone.style.borderColor = "";
            this.dropZone.style.background = "";
            const dt = e.dataTransfer;
            if (dt && dt.files && dt.files.length > 0) {
                App.handleFile(dt.files[0]);
            }
        });

        // Trigger on selection, then reset the input value so selecting the SAME file twice doesn't lock up
        this.fileInput.addEventListener("change", (e) => {
            if (e.target.files && e.target.files.length > 0) {
                App.handleFile(e.target.files[0]);
                e.target.value = ''; // Reset allows exact same file upload immediately again
            }
        });

        // Live Select/Checkbox Updates
        const triggerElements = [
            this.canvasWidth, this.canvasHeight, this.scaleSelect,
            this.ditherCheck, this.invertCheck, this.invertBgCheck, this.optFormat,
            this.optDrawMode, this.optVarName, this.previewTheme
        ];
        triggerElements.forEach(el => el.addEventListener("change", () => App.updatePreview()));

        // Invert BG Logic
        const wrapInvertBg = document.getElementById("wrap-invert-bg");
        this.invertCheck.addEventListener("change", () => {
            wrapInvertBg.style.display = this.invertCheck.checked ? "inline-flex" : "none";
        });
        // Init state
        wrapInvertBg.style.display = this.invertCheck.checked ? "inline-flex" : "none";

        // Live Slider Updates
        this.brightnessInput.addEventListener("input", e => {
            this.brightnessVal.textContent = e.target.value;
            App.updatePreview();
        });
        this.contrastInput.addEventListener("input", e => {
            this.contrastVal.textContent = e.target.value;
            App.updatePreview();
        });
        this.thresholdInput.addEventListener("input", e => {
            this.thresholdVal.textContent = e.target.value;
            App.updatePreview();
        });
        this.optVarName.addEventListener("input", () => App.updatePreview());

        // Exports
        this.btnCopy.addEventListener("click", () => {
            if(!this.codeOutput.value) return;
            navigator.clipboard.writeText(this.codeOutput.value).then(() => {
                const originalHtml = this.btnCopy.innerHTML;
                this.btnCopy.textContent = "Copied!";
                setTimeout(() => { this.btnCopy.innerHTML = originalHtml; }, 1500);
            });
        });

        this.btnDownload.addEventListener("click", () => {
            if(!this.codeOutput.value) return;
            const link = document.createElement("a");
            link.href = URL.createObjectURL(new Blob([this.codeOutput.value], { type: "text/plain" }));
            link.download = (this.optVarName.value || "bitmap") + ".h";
            link.click();
        });
    }
};

const App = {
    init() {
        UI.init();
        this.updatePreview();
    },

    handleFile(file) {
        if (!file.type.startsWith("image/")) {
            return alert("Only images are supported.");
        }
        
        // Reset animation configurations completely from previous files
        AppState.currentFrame = 0;
        AppState.isPaused = false;
        if (AppState.gifTimer) {
            clearTimeout(AppState.gifTimer);
            AppState.gifTimer = null;
        }
        
        // Directly pipe static images into the DOM without hanging the IO parsing Base64 strings
        if (file.type !== "image/gif") {
            const objectUrl = URL.createObjectURL(file);
            Processor.loadImage(objectUrl, () => {
                this.updatePreview();
                // We keep the URL to avoid memory leaks since this is a Single Page Application
                // Best practice is dropping when image unloads, but here we replace sourceImage,
                // so the browser handles GC on closure map overwrite dynamically.
            });
            return;
        }

        // Heavy GIF operations via ArrayBuffer parser: Use asynchronous threading pattern to free UI loop
        const reader = new FileReader();
        reader.onload = e => {
            setTimeout(() => { // Force push microtask queue to allow mouse redraw and animation UI to catch
                try {
                     Processor.loadGif(e.target.result, () => this.updatePreview());
                } catch(err) {
                     console.error("GIF Parsing Exception: Falling back to static cover...", err);
                     Processor.loadImage(URL.createObjectURL(file), () => this.updatePreview());
                }
            }, 10);
        };
        reader.readAsArrayBuffer(file);
    },

    getSettings(frameIndex = -1) {
        let base = {
            width: parseInt(UI.canvasWidth.value) || 128, 
            height: parseInt(UI.canvasHeight.value) || 64,
            scale: UI.scaleSelect.value, 
            brightness: parseInt(UI.brightnessInput.value),
            contrast: parseInt(UI.contrastInput.value),
            threshold: parseInt(UI.thresholdInput.value),
            dither: UI.ditherCheck.checked,
            invert: UI.invertCheck.checked,
            invertBg: UI.invertBgCheck.checked,
            flipH: AppState.tFlipH,
            flipV: AppState.tFlipV, 
            rotate: AppState.tRotate,
            outputFormat: UI.optFormat.value, 
            drawMode: UI.optDrawMode.value,
            varName: UI.optVarName.value || "bitmap", 
            theme: UI.previewTheme.value
        };
        
        if (Processor.sourceIsGif && frameIndex >= 0 && Processor.gifFrames[frameIndex] && Processor.gifFrames[frameIndex].tuning) {
            return Object.assign({}, base, Processor.gifFrames[frameIndex].tuning);
        }
        return base;
    },

    applyFrameSlidersToUI(idx) {
        if (!Processor.sourceIsGif || !Processor.gifFrames[idx]) return;
        
        AppState.isUpdatingSliders = true;
        let t = Processor.gifFrames[idx].tuning || {};
        
        UI.brightnessInput.value = t.brightness !== undefined ? t.brightness : 0;
        UI.brightnessVal.textContent = UI.brightnessInput.value;
        
        UI.contrastInput.value = t.contrast !== undefined ? t.contrast : 0;
        UI.contrastVal.textContent = UI.contrastInput.value;
        
        UI.thresholdInput.value = t.threshold !== undefined ? t.threshold : 128;
        UI.thresholdVal.textContent = UI.thresholdInput.value;
        
        if (t.dither !== undefined) UI.ditherCheck.checked = t.dither;
        if (t.invert !== undefined) UI.invertCheck.checked = t.invert;
        if (t.invertBg !== undefined) UI.invertBgCheck.checked = t.invertBg;

        AppState.isUpdatingSliders = false;
    },

    renderSingleThumbnail(idx) {
        if (UI.timeline.children.length > idx + 1) {
            const thumb = UI.timeline.children[idx + 1].querySelector('canvas');
            if (thumb) {
                Processor.processFrame(thumb, Processor.gifFrames[idx].imgData, this.getSettings(idx));
            }
        }
    },

    playGif() {
        if (AppState.gifTimer) {
            clearTimeout(AppState.gifTimer);
        }
        
        const renderNextFrame = () => {
            if (!Processor.sourceIsGif) return;
            
            if (!AppState.isPaused) {
                const frame = Processor.gifFrames[AppState.currentFrame];
                const set = this.getSettings(AppState.currentFrame);
                
                Processor.processFrame(UI.previewCanvas, frame.imgData, set);
                const frTxt = ` | GIF: ${AppState.currentFrame + 1}/${Processor.gifFrames.length} fr`;
                UI.previewInfo.textContent = `${set.width} × ${set.height}${frTxt}`;
                
                document.querySelectorAll('.gif-thumb-wrap').forEach((el, idx) => {
                    el.classList.toggle('active', idx === 0);
                });
                AppState.currentFrame = (AppState.currentFrame + 1) % Processor.gifFrames.length;
                
                let delay = frame.delay * 10 || 100;
                if (delay < 20) delay = 100; 
                AppState.gifTimer = setTimeout(renderNextFrame, delay);
            } else {
                const set = this.getSettings();
                const frTxt = ` | GIF: ${AppState.currentFrame + 1}/${Processor.gifFrames.length} fr (Paused)`;
                UI.previewInfo.textContent = `${set.width} × ${set.height}${frTxt}`;
                AppState.gifTimer = setTimeout(renderNextFrame, 100);
            }
        };
        renderNextFrame();
    },

    updatePreview() {
        if (AppState.isUpdatingSliders) return;

        const setCurrent = this.getSettings(AppState.isPaused ? AppState.currentFrame : -1);

        UI.presetBtns.forEach(btn => {
            const [w, h] = btn.dataset.preset.split('x');
            if (parseInt(w) === setCurrent.width && parseInt(h) === setCurrent.height) {
                btn.classList.add('active');
            } else {
                btn.classList.remove('active');
            }
        });
        
        UI.previewInfo.textContent = `${setCurrent.width} × ${setCurrent.height}`;

        if (!Processor.sourceImage) return;

        const setGlobal = this.getSettings(-1);

        UI.previewCanvas.width = setCurrent.width;
        UI.previewCanvas.height = setCurrent.height;

        if (Processor.sourceIsGif) {
            UI.previewCanvas.style.cursor = "pointer";
            UI.timeline.style.display = "flex";

            if (AppState.isPaused) {
                // Save tuning state into the current frame
                let f = Processor.gifFrames[AppState.currentFrame];
                if (!f.tuning) f.tuning = {};
                f.tuning.brightness = parseInt(UI.brightnessInput.value);
                f.tuning.contrast = parseInt(UI.contrastInput.value);
                f.tuning.threshold = parseInt(UI.thresholdInput.value);
                f.tuning.dither = UI.ditherCheck.checked;
                f.tuning.invert = UI.invertCheck.checked;
                f.tuning.invertBg = UI.invertBgCheck.checked;
            } else {
                Processor.gifFrames.forEach(f => {
                    if (!f.tuning) f.tuning = {};
                    f.tuning.brightness = parseInt(UI.brightnessInput.value);
                    f.tuning.contrast = parseInt(UI.contrastInput.value);
                    f.tuning.threshold = parseInt(UI.thresholdInput.value);
                    f.tuning.dither = UI.ditherCheck.checked;
                    f.tuning.invert = UI.invertCheck.checked;
                    f.tuning.invertBg = UI.invertBgCheck.checked;
                });
            }

            let needsRebuild = (UI.timeline.children.length === 0 || 
                                setCurrent.width !== AppState.lastW || 
                                setCurrent.height !== AppState.lastH || 
                                setCurrent.scale !== AppState.lastScale);

            if (needsRebuild) {
                UI.timeline.innerHTML = ""; 
                
                const animWrap = document.createElement("div");
                animWrap.className = "gif-thumb-wrap " + (!AppState.isPaused ? "active" : "");
                animWrap.title = "Play Full Animation";
                
                const animThumb = document.createElement("canvas");
                animThumb.className = "gif-frame-thumb animation-thumb";
                animThumb.width = setCurrent.width;
                animThumb.height = setCurrent.height;
                Processor.processFrame(animThumb, Processor.gifFrames[0].imgData, this.getSettings(0));
                
                const playIcon = document.createElement("div");
                playIcon.className = "thumb-label play-icon";
                playIcon.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="2" width="20" height="20" rx="2.18" ry="2.18"></rect><line x1="7" y1="2" x2="7" y2="22"></line><line x1="17" y1="2" x2="17" y2="22"></line><line x1="2" y1="12" x2="22" y2="12"></line><line x1="2" y1="7" x2="7" y2="7"></line><line x1="2" y1="17" x2="7" y2="17"></line><line x1="17" y1="17" x2="22" y2="17"></line><line x1="17" y1="7" x2="22" y2="7"></line></svg>`;

                animWrap.appendChild(animThumb);
                animWrap.appendChild(playIcon);
                animWrap.onclick = () => {
                    AppState.isPaused = false;
                    this.applyFrameSlidersToUI(0);
                    this.updatePreview();
                };
                UI.timeline.appendChild(animWrap);

                Processor.gifFrames.forEach((fr, idx) => {
                    const thumbWrap = document.createElement("div");
                    thumbWrap.className = "gif-thumb-wrap " + (AppState.isPaused && AppState.currentFrame === idx ? "active" : "");
                    thumbWrap.title = `Frame ${idx + 1}`;

                    const thumb = document.createElement("canvas");
                    thumb.className = "gif-frame-thumb";
                    thumb.width = setCurrent.width;
                    thumb.height = setCurrent.height;
                    Processor.processFrame(thumb, fr.imgData, this.getSettings(idx));

                    const frameLbl = document.createElement("div");
                    frameLbl.className = "thumb-label";
                    frameLbl.textContent = idx + 1;

                    thumbWrap.appendChild(thumb);
                    thumbWrap.appendChild(frameLbl);

                    thumbWrap.onclick = () => {
                        AppState.isPaused = true;
                        AppState.currentFrame = idx;
                        this.applyFrameSlidersToUI(idx);
                        Processor.processFrame(UI.previewCanvas, fr.imgData, this.getSettings(idx));
                        document.querySelectorAll('.gif-thumb-wrap').forEach((el, i) => {
                            el.classList.toggle('active', i === idx + 1);
                        });
                        this.updatePreview();
                    };
                    UI.timeline.appendChild(thumbWrap);
                });
            } else {
                if (AppState.isPaused) {
                    this.renderSingleThumbnail(AppState.currentFrame);
                } else {
                    for(let i=0; i<Processor.gifFrames.length; i++) this.renderSingleThumbnail(i);
                    Processor.processFrame(UI.timeline.children[0].querySelector('canvas'), Processor.gifFrames[0].imgData, this.getSettings(0));
                }
            }

            if (AppState.isPaused) {
                Processor.processFrame(UI.previewCanvas, Processor.gifFrames[AppState.currentFrame].imgData, this.getSettings(AppState.currentFrame));
                document.querySelectorAll('.gif-thumb-wrap').forEach((el, i) => {
                    el.classList.toggle('active', i === AppState.currentFrame + 1);
                });
            } else {
                if(!AppState.gifTimer) this.playGif();
            }

            AppState.lastW = setCurrent.width;
            AppState.lastH = setCurrent.height; 
            AppState.lastScale = setCurrent.scale;
        } else {
            UI.previewCanvas.style.cursor = "default";
            UI.timeline.style.display = "none";
            UI.previewInfo.textContent = `${setCurrent.width} × ${setCurrent.height}`;
            Processor.processFrame(UI.previewCanvas, Processor.sourceImage, setCurrent);
        }
        
        UI.codeOutput.value = Generator.generate(setGlobal);
    }
};

document.addEventListener("DOMContentLoaded", () => App.init());


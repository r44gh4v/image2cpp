const fs = require('fs');

// 1. Fix CSS
let css = fs.readFileSync('css/style.css', 'utf8');
css = css.replace(/button, label, select, input\[type="file"\], input\[type="checkbox"\], input\[type="radio"\], \.preset-btn, \.cb-wrap \{\s*cursor: pointer;\s*\}/g, 'button, select, input[type="file"], input[type="checkbox"], input[type="radio"], .preset-btn, .cb-wrap { cursor: pointer; }');
fs.writeFileSync('css/style.css', css);

// 2. Rewrite main.js using standard ES modules structure to follow SOLID principles and make it clean.
const mainJsContent = `
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
        // Transforms
        this.btnFlipH.addEventListener("click", () => { AppState.tFlipH = !AppState.tFlipH; App.updatePreview(); });
        this.btnFlipV.addEventListener("click", () => { AppState.tFlipV = !AppState.tFlipV; App.updatePreview(); });
        this.btnRotate.addEventListener("click", () => { AppState.tRotate = (AppState.tRotate + 90) % 360; App.updatePreview(); });

        // Pause toggle
        this.previewCanvas.style.cursor = "pointer";
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

        // File Selection (Drop & Click)
        this.dropZone.addEventListener("click", () => this.fileInput.click());
        this.dropZone.addEventListener("dragover", e => { e.preventDefault(); this.dropZone.style.borderColor = "var(--accent)"; });
        this.dropZone.addEventListener("dragleave", e => { this.dropZone.style.borderColor = ""; });
        this.dropZone.addEventListener("drop", e => {
            e.preventDefault(); 
            this.dropZone.style.borderColor = "";
            if (e.dataTransfer.files.length) App.handleFile(e.dataTransfer.files[0]);
        });
        
        // Critical Fix: Add specific change listener to update everything cleanly when picking a regular file
        this.fileInput.addEventListener("change", e => { 
            if (e.target.files.length) App.handleFile(e.target.files[0]); 
        });

        // Live Select/Checkbox Updates
        const triggerElements = [
            this.canvasWidth, this.canvasHeight, this.scaleSelect, 
            this.ditherCheck, this.invertCheck, this.optFormat, 
            this.optDrawMode, this.optVarName, this.previewTheme
        ];
        triggerElements.forEach(el => el.addEventListener("change", () => App.updatePreview()));

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
    },

    handleFile(file) {
        if (!file.type.startsWith("image/")) {
            return alert("Only images are supported.");
        }
        
        // Reset states
        AppState.currentFrame = 0;
        AppState.isPaused = false;
        
        const reader = new FileReader();
        reader.onload = e => {
            if (file.type === "image/gif") {
                try {
                    Processor.loadGif(e.target.result, () => this.updatePreview());
                } catch(err) {
                    console.error("GIF Parsing Error:", err);
                    Processor.loadImage(URL.createObjectURL(file), () => this.updatePreview());
                }
            } else {
                Processor.loadImage(e.target.result, () => this.updatePreview());
            }
        };
        
        if (file.type === "image/gif") {
            reader.readAsArrayBuffer(file);
        } else {
            reader.readAsDataURL(file);
        }
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
        
        AppState.isUpdatingSliders = false;
    },

    renderSingleThumbnail(idx) {
        if (UI.timeline.children.length > idx + 1) {
            const thumb = UI.timeline.children[idx + 1];
            Processor.processFrame(thumb, Processor.gifFrames[idx].imgData, this.getSettings(idx));
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
                const frTxt = \` | GIF: \${AppState.currentFrame + 1}/\${Processor.gifFrames.length} fr\`;
                UI.previewInfo.textContent = \`\${set.width} × \${set.height}\${frTxt}\`;
                
                document.querySelectorAll('.gif-frame-thumb').forEach((el, idx) => {
                    el.classList.toggle('active', idx === 0); // "Play Full" thumb is active
                });
                
                AppState.currentFrame = (AppState.currentFrame + 1) % Processor.gifFrames.length;
                
                let delay = frame.delay * 10 || 100;
                if (delay < 20) delay = 100; 
                AppState.gifTimer = setTimeout(renderNextFrame, delay);
            } else {
                const set = this.getSettings();
                const frTxt = \` | GIF: \${AppState.currentFrame + 1}/\${Processor.gifFrames.length} fr (Paused)\`;
                UI.previewInfo.textContent = \`\${set.width} × \${set.height}\${frTxt}\`;
                AppState.gifTimer = setTimeout(renderNextFrame, 100);
            }
        };
        renderNextFrame();
    },

    updatePreview() {
        if (AppState.isUpdatingSliders) return;
        if (!Processor.sourceImage) return;
        
        const setGlobal = this.getSettings(-1);
        const setCurrent = this.getSettings(AppState.isPaused ? AppState.currentFrame : -1);
        
        UI.previewCanvas.width = setCurrent.width; 
        UI.previewCanvas.height = setCurrent.height;

        if (Processor.sourceIsGif) {
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
            } else {
                Processor.gifFrames.forEach(f => f.tuning = null);
            }

            let needsRebuild = (UI.timeline.children.length === 0 || 
                                setCurrent.width !== AppState.lastW || 
                                setCurrent.height !== AppState.lastH || 
                                setCurrent.scale !== AppState.lastScale);

            if (needsRebuild) {
                UI.timeline.innerHTML = ""; 
                const animThumb = document.createElement("canvas");
                animThumb.className = "gif-frame-thumb animation-thumb " + (!AppState.isPaused ? "active" : "");
                animThumb.title = "Play Full Animation";
                animThumb.onclick = () => { 
                    AppState.isPaused = false; 
                    Processor.gifFrames.forEach(f => f.tuning = null); // Reset global
                    this.applyFrameSlidersToUI(0);
                    this.updatePreview();
                };
                
                animThumb.width = setCurrent.width; 
                animThumb.height = setCurrent.height;
                Processor.processFrame(animThumb, Processor.gifFrames[0].imgData, this.getSettings(0));
                UI.timeline.appendChild(animThumb);
                
                Processor.gifFrames.forEach((fr, idx) => {
                    const thumb = document.createElement("canvas");
                    thumb.className = "gif-frame-thumb " + (AppState.isPaused && AppState.currentFrame === idx ? "active" : "");
                    thumb.title = \`Frame \${idx + 1}\`;
                    thumb.width = setCurrent.width; 
                    thumb.height = setCurrent.height;
                    Processor.processFrame(thumb, fr.imgData, this.getSettings(idx));
                    
                    thumb.onclick = () => {
                        AppState.isPaused = true;
                        AppState.currentFrame = idx;
                        this.applyFrameSlidersToUI(idx);
                        Processor.processFrame(UI.previewCanvas, fr.imgData, this.getSettings(idx));
                        document.querySelectorAll('.gif-frame-thumb').forEach((el, i) => {
                            el.classList.toggle('active', i === idx + 1);
                        });
                        this.updatePreview();
                    };
                    UI.timeline.appendChild(thumb);
                });
            } else {
                if (AppState.isPaused) {
                    this.renderSingleThumbnail(AppState.currentFrame);
                } else {
                    for(let i=0; i<Processor.gifFrames.length; i++) this.renderSingleThumbnail(i);
                    this.renderSingleThumbnail(0);
                }
            }

            if (AppState.isPaused) {
                Processor.processFrame(UI.previewCanvas, Processor.gifFrames[AppState.currentFrame].imgData, this.getSettings(AppState.currentFrame));
                document.querySelectorAll('.gif-frame-thumb').forEach((el, i) => {
                    el.classList.toggle('active', i === AppState.currentFrame + 1);
                });
            } else {
                if(!AppState.gifTimer) this.playGif();
            }
            
            AppState.lastW = setCurrent.width; 
            AppState.lastH = setCurrent.height; 
            AppState.lastScale = setCurrent.scale;
        } else {
            UI.timeline.style.display = "none";
            UI.previewInfo.textContent = \`\${setCurrent.width} × \${setCurrent.height}\`;
            Processor.processFrame(UI.previewCanvas, Processor.sourceImage, setCurrent);
        }
        
        UI.codeOutput.value = Generator.generate(setGlobal);
    }
};

document.addEventListener("DOMContentLoaded", () => App.init());
`;
fs.writeFileSync('js/main.js', mainJsContent);

console.log("Success.");

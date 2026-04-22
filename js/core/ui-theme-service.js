(function initImage2CppUiThemeService(root) {
    const DEFAULT_STORAGE_KEY = "image2cpp.uiThemeMode";
    const DEFAULT_MODE = "system";
    const DEFAULT_SEQUENCE = ["system", "light", "dark"];
    const DARK_SCHEME_QUERY = "(prefers-color-scheme: dark)";

    function normalizeMode(value, fallback) {
        if (value === "system" || value === "light" || value === "dark") {
            return value;
        }
        return fallback;
    }

    function detectSystemTheme(matchMediaFn) {
        if (typeof matchMediaFn !== "function") {
            return "dark";
        }

        try {
            const mediaQueryList = matchMediaFn(DARK_SCHEME_QUERY);
            return mediaQueryList && mediaQueryList.matches ? "dark" : "light";
        } catch (error) {
            return "dark";
        }
    }

    function readStorage(storage, key) {
        if (!storage || typeof storage.getItem !== "function") {
            return null;
        }

        try {
            return storage.getItem(key);
        } catch (error) {
            return null;
        }
    }

    function writeStorage(storage, key, value) {
        if (!storage || typeof storage.setItem !== "function") {
            return;
        }

        try {
            storage.setItem(key, value);
        } catch (error) {
            // Ignore storage failures (private mode, disabled storage, etc.).
        }
    }

    function create(options) {
        const config = options || {};
        const storageKey = typeof config.storageKey === "string" && config.storageKey
            ? config.storageKey
            : DEFAULT_STORAGE_KEY;
        const attributeName = typeof config.attributeName === "string" && config.attributeName
            ? config.attributeName
            : "data-app-theme";

        const sequenceSource = Array.isArray(config.modeSequence) && config.modeSequence.length > 0
            ? config.modeSequence
            : DEFAULT_SEQUENCE;
        const modeSequence = sequenceSource
            .map((mode) => normalizeMode(mode, null))
            .filter((mode) => Boolean(mode));
        if (modeSequence.length === 0) {
            modeSequence.push(...DEFAULT_SEQUENCE);
        }

        const storage = config.storage || (typeof localStorage !== "undefined" ? localStorage : null);
        const matchMediaFn = typeof config.matchMedia === "function"
            ? config.matchMedia
            : (
                typeof window !== "undefined" && typeof window.matchMedia === "function"
                    ? window.matchMedia.bind(window)
                    : null
            );
        const rootElement = config.rootElement
            || (typeof document !== "undefined" ? document.documentElement : null);

        let mode = normalizeMode(config.defaultMode, DEFAULT_MODE);
        let resolvedTheme = "dark";
        let detachSystemThemeListener = null;
        const listeners = new Set();

        function getSnapshot() {
            return {
                mode,
                resolvedTheme,
            };
        }

        function notifyListeners() {
            const snapshot = getSnapshot();
            listeners.forEach((listener) => {
                try {
                    listener(snapshot);
                } catch (error) {
                    // Listener failures should not break theme application.
                }
            });
        }

        function applyResolvedTheme(nextTheme) {
            resolvedTheme = nextTheme === "light" ? "light" : "dark";
            if (rootElement && typeof rootElement.setAttribute === "function") {
                rootElement.setAttribute(attributeName, resolvedTheme);
            }
        }

        function onSystemThemeChange() {
            if (mode !== "system") {
                return;
            }
            syncFromMode(true);
        }

        function bindSystemThemeListener() {
            if (detachSystemThemeListener) {
                detachSystemThemeListener();
                detachSystemThemeListener = null;
            }

            if (mode !== "system" || typeof matchMediaFn !== "function") {
                return;
            }

            let mediaQueryList;
            try {
                mediaQueryList = matchMediaFn(DARK_SCHEME_QUERY);
            } catch (error) {
                mediaQueryList = null;
            }

            if (!mediaQueryList) {
                return;
            }

            if (typeof mediaQueryList.addEventListener === "function") {
                mediaQueryList.addEventListener("change", onSystemThemeChange);
                detachSystemThemeListener = () => {
                    mediaQueryList.removeEventListener("change", onSystemThemeChange);
                };
                return;
            }

            if (typeof mediaQueryList.addListener === "function") {
                mediaQueryList.addListener(onSystemThemeChange);
                detachSystemThemeListener = () => {
                    mediaQueryList.removeListener(onSystemThemeChange);
                };
            }
        }

        function syncFromMode(shouldNotify) {
            const nextTheme = mode === "system"
                ? detectSystemTheme(matchMediaFn)
                : mode;

            applyResolvedTheme(nextTheme);
            bindSystemThemeListener();

            if (shouldNotify === true) {
                notifyListeners();
            }

            return getSnapshot();
        }

        function persistMode() {
            writeStorage(storage, storageKey, mode);
        }

        function setMode(nextMode, optionsSetMode) {
            const optionsSafe = optionsSetMode || {};
            mode = normalizeMode(nextMode, mode);

            if (optionsSafe.persist !== false) {
                persistMode();
            }

            return syncFromMode(optionsSafe.notify !== false);
        }

        function cycleMode() {
            const currentIndex = modeSequence.indexOf(mode);
            const safeIndex = currentIndex >= 0 ? currentIndex : 0;
            const nextMode = modeSequence[(safeIndex + 1) % modeSequence.length];
            return setMode(nextMode, { persist: true, notify: true });
        }

        function init() {
            const storedMode = readStorage(storage, storageKey);
            mode = normalizeMode(storedMode, mode);
            return syncFromMode(true);
        }

        function subscribe(listener) {
            if (typeof listener !== "function") {
                return () => { };
            }

            listeners.add(listener);
            return () => {
                listeners.delete(listener);
            };
        }

        function destroy() {
            if (detachSystemThemeListener) {
                detachSystemThemeListener();
                detachSystemThemeListener = null;
            }
            listeners.clear();
        }

        return {
            init,
            getSnapshot,
            getMode: () => mode,
            getResolvedTheme: () => resolvedTheme,
            setMode,
            cycleMode,
            subscribe,
            destroy,
        };
    }

    const api = {
        DEFAULT_MODE,
        DEFAULT_SEQUENCE,
        create,
    };

    if (typeof module !== "undefined" && module.exports) {
        module.exports = api;
    }

    root.Image2CppUiThemeService = api;
})(typeof globalThis !== "undefined" ? globalThis : this);

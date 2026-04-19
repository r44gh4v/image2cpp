const assert = require("assert");
const uiThemeService = require("../js/core/ui-theme-service.js");

function createStorage() {
    const data = new Map();
    return {
        getItem(key) {
            return data.has(key) ? data.get(key) : null;
        },
        setItem(key, value) {
            data.set(key, String(value));
        },
    };
}

function createRootElement() {
    return {
        attrs: {},
        setAttribute(name, value) {
            this.attrs[name] = String(value);
        },
    };
}

function createMediaQueryList(initialMatches) {
    let matches = Boolean(initialMatches);
    const listeners = new Set();

    return {
        get matches() {
            return matches;
        },
        setMatches(nextMatches) {
            matches = Boolean(nextMatches);
            const activeListeners = Array.from(listeners);
            activeListeners.forEach((listener) => listener({ matches }));
        },
        addEventListener(eventName, listener) {
            if (eventName === "change") {
                listeners.add(listener);
            }
        },
        removeEventListener(eventName, listener) {
            if (eventName === "change") {
                listeners.delete(listener);
            }
        },
    };
}

{
    const storage = createStorage();
    const rootElement = createRootElement();
    const mediaQueryList = createMediaQueryList(true);

    const service = uiThemeService.create({
        storage,
        rootElement,
        matchMedia: () => mediaQueryList,
        defaultMode: "system",
    });

    const snapshot = service.init();

    assert.strictEqual(snapshot.mode, "system");
    assert.strictEqual(snapshot.resolvedTheme, "dark");
    assert.strictEqual(rootElement.attrs["data-app-theme"], "dark");

    service.destroy();
}

{
    const storage = createStorage();
    const rootElement = createRootElement();
    const mediaQueryList = createMediaQueryList(true);

    const service = uiThemeService.create({
        storage,
        rootElement,
        matchMedia: () => mediaQueryList,
        defaultMode: "system",
    });

    service.init();

    let snapshot = service.cycleMode();
    assert.strictEqual(snapshot.mode, "light");
    assert.strictEqual(snapshot.resolvedTheme, "light");
    assert.strictEqual(storage.getItem("image2cpp.uiThemeMode"), "light");
    assert.strictEqual(rootElement.attrs["data-app-theme"], "light");

    snapshot = service.cycleMode();
    assert.strictEqual(snapshot.mode, "dark");
    assert.strictEqual(snapshot.resolvedTheme, "dark");
    assert.strictEqual(storage.getItem("image2cpp.uiThemeMode"), "dark");

    snapshot = service.cycleMode();
    assert.strictEqual(snapshot.mode, "system");
    assert.strictEqual(snapshot.resolvedTheme, "dark");
    assert.strictEqual(storage.getItem("image2cpp.uiThemeMode"), "system");

    mediaQueryList.setMatches(false);
    assert.strictEqual(service.getSnapshot().resolvedTheme, "light");
    assert.strictEqual(rootElement.attrs["data-app-theme"], "light");

    service.destroy();
}

{
    const storage = createStorage();
    storage.setItem("image2cpp.uiThemeMode", "light");

    const rootElement = createRootElement();
    const mediaQueryList = createMediaQueryList(true);

    const service = uiThemeService.create({
        storage,
        rootElement,
        matchMedia: () => mediaQueryList,
        defaultMode: "system",
    });

    let snapshot = service.init();
    assert.strictEqual(snapshot.mode, "light");
    assert.strictEqual(snapshot.resolvedTheme, "light");

    snapshot = service.setMode("invalid");
    assert.strictEqual(snapshot.mode, "light");
    assert.strictEqual(snapshot.resolvedTheme, "light");

    service.destroy();
}

{
    const storage = createStorage();
    const rootElement = createRootElement();
    const mediaQueryList = createMediaQueryList(false);

    const service = uiThemeService.create({
        storage,
        rootElement,
        matchMedia: () => mediaQueryList,
        defaultMode: "system",
    });

    const events = [];
    const unsubscribe = service.subscribe((snapshot) => {
        events.push(`${snapshot.mode}:${snapshot.resolvedTheme}`);
    });

    service.init();
    service.cycleMode();

    assert.ok(events.length >= 2);
    assert.strictEqual(events[0], "system:light");
    assert.strictEqual(events[1], "light:light");

    unsubscribe();
    service.destroy();
}

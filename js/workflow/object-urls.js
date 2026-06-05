const activeUrls = new Set();

function canUseObjectUrls() {
    return typeof URL !== "undefined"
        && typeof URL.createObjectURL === "function"
        && typeof URL.revokeObjectURL === "function";
}

export function createObjectUrl(blob) {
    if (!canUseObjectUrls()) {
        return null;
    }

    const url = URL.createObjectURL(blob);
    activeUrls.add(url);
    return url;
}

export function revokeObjectUrl(url) {
    if (!url || !activeUrls.has(url) || !canUseObjectUrls()) {
        return;
    }

    URL.revokeObjectURL(url);
    activeUrls.delete(url);
}

export function revokeAll() {
    if (!canUseObjectUrls()) {
        activeUrls.clear();
        return;
    }

    for (const url of activeUrls) {
        URL.revokeObjectURL(url);
    }
    activeUrls.clear();
}

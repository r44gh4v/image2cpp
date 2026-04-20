(function initImage2CppVisitCounterService(root) {
    const DEFAULT_BASE_URL = "https://api.countapi.xyz";
    const DEFAULT_NAMESPACE_PREFIX = "image2cpp";
    const DEFAULT_KEY = "unique-visits-v1";
    const DEFAULT_RETRY_DELAYS_MS = [0, 380, 900];
    const DEFAULT_REQUEST_TIMEOUT_MS = 4500;
    const DEFAULT_LOCK_TTL_MS = 8000;
    const DEFAULT_LOCK_WAIT_MS = 260;

    function sanitizeToken(value, fallback) {
        const normalized = String(value || "")
            .toLowerCase()
            .replace(/[^a-z0-9._-]+/g, "-")
            .replace(/^-+|-+$/g, "");
        return normalized || fallback;
    }

    function normalizePositiveNumber(value, fallback, minimum) {
        const parsed = Number(value);
        if (!Number.isFinite(parsed)) {
            return fallback;
        }
        return Math.max(minimum, parsed);
    }

    function safeReadStorage(storage, key) {
        if (!storage || typeof storage.getItem !== "function") {
            return null;
        }

        try {
            return storage.getItem(key);
        } catch (error) {
            return null;
        }
    }

    function safeWriteStorage(storage, key, value) {
        if (!storage || typeof storage.setItem !== "function") {
            return;
        }

        try {
            storage.setItem(key, String(value));
        } catch (error) {
            // Ignore quota and private-mode write failures.
        }
    }

    function safeRemoveStorage(storage, key) {
        if (!storage || typeof storage.removeItem !== "function") {
            return;
        }

        try {
            storage.removeItem(key);
        } catch (error) {
            // Ignore storage cleanup failures.
        }
    }

    function readCookie(doc, name) {
        if (!doc || typeof doc.cookie !== "string") {
            return null;
        }

        const token = `${name}=`;
        const segments = doc.cookie.split(";");
        for (let i = 0; i < segments.length; i += 1) {
            const part = segments[i].trim();
            if (part.indexOf(token) === 0) {
                return decodeURIComponent(part.slice(token.length));
            }
        }

        return null;
    }

    function writeCookie(doc, name, value, maxAgeSeconds) {
        if (!doc) {
            return;
        }

        try {
            doc.cookie = `${name}=${encodeURIComponent(String(value))}; Max-Age=${Math.max(0, Math.floor(maxAgeSeconds))}; Path=/; SameSite=Lax`;
        } catch (error) {
            // Ignore cookie write failures.
        }
    }

    function create(options) {
        const config = options || {};
        const locationLike = config.location || (typeof root.location !== "undefined" ? root.location : null);
        const rawHost = String(locationLike && locationLike.hostname ? locationLike.hostname : "").toLowerCase();
        const host = sanitizeToken(locationLike && locationLike.hostname ? locationLike.hostname : "site", "site");
        const isLocalHost = rawHost === "localhost" || rawHost === "127.0.0.1";
        const isEnabled = config.enabled !== false && (!isLocalHost || config.allowLocalhost === true);
        const namespace = sanitizeToken(config.namespace || `${DEFAULT_NAMESPACE_PREFIX}-${host}`, `${DEFAULT_NAMESPACE_PREFIX}-site`);
        const key = sanitizeToken(config.key || DEFAULT_KEY, DEFAULT_KEY);
        const baseUrl = typeof config.baseUrl === "string" && config.baseUrl
            ? config.baseUrl.replace(/\/+$/, "")
            : DEFAULT_BASE_URL;

        const retryDelaysMs = Array.isArray(config.retryDelaysMs) && config.retryDelaysMs.length > 0
            ? config.retryDelaysMs.slice()
            : DEFAULT_RETRY_DELAYS_MS.slice();
        const requestTimeoutMs = normalizePositiveNumber(config.requestTimeoutMs, DEFAULT_REQUEST_TIMEOUT_MS, 300);
        const lockTtlMs = normalizePositiveNumber(config.lockTtlMs, DEFAULT_LOCK_TTL_MS, 500);
        const lockWaitMs = normalizePositiveNumber(config.lockWaitMs, DEFAULT_LOCK_WAIT_MS, 0);

        const storage = config.storage || (typeof root.localStorage !== "undefined" ? root.localStorage : null);
        const doc = config.document || (typeof root.document !== "undefined" ? root.document : null);
        const now = typeof config.now === "function" ? config.now : Date.now;
        const fetchImpl = typeof config.fetch === "function"
            ? config.fetch
            : (typeof root.fetch === "function" ? root.fetch.bind(root) : null);
        const setTimeoutImpl = typeof config.setTimeout === "function"
            ? config.setTimeout
            : (typeof root.setTimeout === "function" ? root.setTimeout.bind(root) : setTimeout);
        const clearTimeoutImpl = typeof config.clearTimeout === "function"
            ? config.clearTimeout
            : (typeof root.clearTimeout === "function" ? root.clearTimeout.bind(root) : clearTimeout);

        const storagePrefix = typeof config.storagePrefix === "string" && config.storagePrefix
            ? config.storagePrefix
            : `image2cpp.visitCounter.${namespace}.${key}`;

        const countedStorageKey = `${storagePrefix}.counted`;
        const cachedValueKey = `${storagePrefix}.lastValue`;
        const lockStorageKey = `${storagePrefix}.lock`;
        const countedCookieName = sanitizeToken(`${storagePrefix}.counted`, "image2cpp-visit-counted");

        const lockOwnerId = `${Math.random().toString(36).slice(2)}${now().toString(36)}`;
        let lastSnapshot = {
            value: null,
            source: "init",
            counted: false,
            namespace,
            key,
        };

        function hasCountedVisit() {
            const fromStorage = safeReadStorage(storage, countedStorageKey);
            if (fromStorage === "1") {
                return true;
            }

            const fromCookie = readCookie(doc, countedCookieName);
            return fromCookie === "1";
        }

        function markCountedVisit() {
            safeWriteStorage(storage, countedStorageKey, "1");
            writeCookie(doc, countedCookieName, "1", 60 * 60 * 24 * 365 * 3);
        }

        function readCachedValue() {
            const raw = safeReadStorage(storage, cachedValueKey);
            const parsed = Number(raw);
            if (!Number.isFinite(parsed) || parsed < 0) {
                return null;
            }
            return Math.floor(parsed);
        }

        function writeCachedValue(value) {
            const parsed = Number(value);
            if (!Number.isFinite(parsed) || parsed < 0) {
                return;
            }

            safeWriteStorage(storage, cachedValueKey, Math.floor(parsed));
        }

        function parseLock(rawValue) {
            if (!rawValue) {
                return null;
            }

            try {
                const parsed = JSON.parse(rawValue);
                if (!parsed || typeof parsed.id !== "string") {
                    return null;
                }
                const expiresAt = Number(parsed.expiresAt);
                if (!Number.isFinite(expiresAt)) {
                    return null;
                }
                return {
                    id: parsed.id,
                    expiresAt,
                };
            } catch (error) {
                return null;
            }
        }

        function acquireLock() {
            if (!storage || typeof storage.getItem !== "function" || typeof storage.setItem !== "function") {
                return true;
            }

            const current = parseLock(safeReadStorage(storage, lockStorageKey));
            const currentTime = now();

            if (current && current.expiresAt > currentTime && current.id !== lockOwnerId) {
                return false;
            }

            safeWriteStorage(storage, lockStorageKey, JSON.stringify({
                id: lockOwnerId,
                expiresAt: currentTime + lockTtlMs,
            }));

            const verify = parseLock(safeReadStorage(storage, lockStorageKey));
            return Boolean(verify && verify.id === lockOwnerId);
        }

        function releaseLock() {
            if (!storage || typeof storage.getItem !== "function" || typeof storage.removeItem !== "function") {
                return;
            }

            const current = parseLock(safeReadStorage(storage, lockStorageKey));
            if (current && current.id === lockOwnerId) {
                safeRemoveStorage(storage, lockStorageKey);
            }
        }

        function wait(ms) {
            const safeDelay = Math.max(0, Number(ms) || 0);
            return new Promise((resolve) => {
                setTimeoutImpl(resolve, safeDelay);
            });
        }

        async function fetchCounterValue(action) {
            if (typeof fetchImpl !== "function") {
                throw new Error("fetch-unavailable");
            }

            const endpoint = `${baseUrl}/${action}/${encodeURIComponent(namespace)}/${encodeURIComponent(key)}`;
            const hasAbortController = typeof root.AbortController === "function";
            const controller = hasAbortController ? new root.AbortController() : null;
            const timerId = controller
                ? setTimeoutImpl(() => {
                    controller.abort();
                }, requestTimeoutMs)
                : null;

            try {
                const response = await fetchImpl(endpoint, {
                    method: "GET",
                    mode: "cors",
                    cache: "no-store",
                    headers: {
                        Accept: "application/json",
                    },
                    signal: controller ? controller.signal : undefined,
                });

                if (!response || response.ok !== true || typeof response.json !== "function") {
                    const status = response && typeof response.status !== "undefined"
                        ? response.status
                        : "unknown";
                    throw new Error(`http-${status}`);
                }

                const payload = await response.json();
                const value = Number(payload && payload.value);

                if (!Number.isFinite(value) || value < 0) {
                    throw new Error("invalid-counter-value");
                }

                return Math.floor(value);
            } finally {
                if (timerId !== null) {
                    clearTimeoutImpl(timerId);
                }
            }
        }

        async function withRetry(task) {
            let lastError = null;

            for (let i = 0; i < retryDelaysMs.length; i += 1) {
                if (i > 0) {
                    const delay = normalizePositiveNumber(retryDelaysMs[i], 0, 0);
                    if (delay > 0) {
                        await wait(delay);
                    }
                }

                try {
                    return await task();
                } catch (error) {
                    lastError = error;
                }
            }

            throw lastError || new Error("counter-request-failed");
        }

        async function getUniqueVisitCount() {
            if (!isEnabled) {
                const cachedValue = readCachedValue();
                lastSnapshot = {
                    value: cachedValue,
                    source: cachedValue === null ? "disabled" : "cache",
                    counted: hasCountedVisit(),
                    namespace,
                    key,
                };
                return lastSnapshot;
            }

            let counted = hasCountedVisit();

            if (!counted) {
                const lockAcquired = acquireLock();

                if (lockAcquired) {
                    try {
                        const incremented = await withRetry(() => fetchCounterValue("hit"));
                        markCountedVisit();
                        writeCachedValue(incremented);

                        lastSnapshot = {
                            value: incremented,
                            source: "network-hit",
                            counted: true,
                            namespace,
                            key,
                        };
                        return lastSnapshot;
                    } catch (error) {
                        // Fall through to read path for graceful degradation.
                    } finally {
                        releaseLock();
                    }
                } else if (lockWaitMs > 0) {
                    await wait(lockWaitMs);
                }
            }

            counted = hasCountedVisit();

            try {
                const currentValue = await withRetry(() => fetchCounterValue("get"));
                writeCachedValue(currentValue);

                lastSnapshot = {
                    value: currentValue,
                    source: "network-get",
                    counted,
                    namespace,
                    key,
                };
                return lastSnapshot;
            } catch (error) {
                const cachedValue = readCachedValue();

                lastSnapshot = {
                    value: cachedValue,
                    source: cachedValue === null ? "unavailable" : "cache",
                    counted,
                    namespace,
                    key,
                };
                return lastSnapshot;
            }
        }

        function getSnapshot() {
            return Object.assign({}, lastSnapshot);
        }

        return {
            getUniqueVisitCount,
            getSnapshot,
        };
    }

    const api = {
        create,
    };

    if (typeof module !== "undefined" && module.exports) {
        module.exports = api;
    }

    root.Image2CppVisitCounterService = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
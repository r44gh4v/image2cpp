(function initImage2CppAnalyticsService(root) {
    const DEFAULT_MEASUREMENT_ID = "G-07YZ2LEC2T";

    function sanitizeEventName(rawValue) {
        const normalized = String(rawValue || "")
            .toLowerCase()
            .replace(/[^a-z0-9_]+/g, "_")
            .replace(/^_+|_+$/g, "")
            .slice(0, 40);
        return normalized;
    }

    function sanitizeParamKey(rawValue) {
        const normalized = String(rawValue || "")
            .toLowerCase()
            .replace(/[^a-z0-9_]+/g, "_")
            .replace(/^_+|_+$/g, "")
            .slice(0, 40);
        return normalized;
    }

    function sanitizeParamValue(rawValue) {
        if (typeof rawValue === "string") {
            return rawValue.slice(0, 120);
        }

        if (typeof rawValue === "number") {
            return Number.isFinite(rawValue) ? rawValue : 0;
        }

        if (typeof rawValue === "boolean") {
            return rawValue;
        }

        return String(rawValue || "").slice(0, 120);
    }

    function bucketFileSize(sizeBytes) {
        const size = Number(sizeBytes);
        if (!Number.isFinite(size) || size < 0) {
            return "unknown";
        }

        if (size < 256 * 1024) {
            return "lt_256kb";
        }

        if (size < 1024 * 1024) {
            return "lt_1mb";
        }

        if (size < 3 * 1024 * 1024) {
            return "lt_3mb";
        }

        if (size < 10 * 1024 * 1024) {
            return "lt_10mb";
        }

        return "gte_10mb";
    }

    function create(options) {
        const config = options || {};
        const locationLike = config.location || (typeof root.location !== "undefined" ? root.location : null);
        const host = String(locationLike && locationLike.hostname ? locationLike.hostname : "").toLowerCase();

        const isLocalHost = host === "localhost" || host === "127.0.0.1";
        const measurementId = String(config.measurementId || DEFAULT_MEASUREMENT_ID || "").trim();
        const respectsDoNotTrack = config.respectDoNotTrack !== false;
        const navigatorLike = typeof root.navigator !== "undefined" ? root.navigator : null;
        const doNotTrackValue = String(
            (navigatorLike && navigatorLike.doNotTrack)
            || root.doNotTrack
            || ""
        ).toLowerCase();
        const doNotTrackEnabled = respectsDoNotTrack && (doNotTrackValue === "1" || doNotTrackValue === "yes");
        const enabled = config.enabled !== false
            && !doNotTrackEnabled
            && (!isLocalHost || config.allowLocalhost === true)
            && measurementId.length > 0;

        function canTrack() {
            return enabled && typeof root.gtag === "function";
        }

        function trackEvent(eventName, params) {
            if (!canTrack()) {
                return false;
            }

            const safeEventName = sanitizeEventName(eventName);
            if (!safeEventName) {
                return false;
            }

            const safeParams = {
                send_to: measurementId,
            };

            const sourceParams = params && typeof params === "object" ? params : {};
            Object.keys(sourceParams).forEach((rawKey) => {
                const safeKey = sanitizeParamKey(rawKey);
                if (!safeKey) {
                    return;
                }
                safeParams[safeKey] = sanitizeParamValue(sourceParams[rawKey]);
            });

            try {
                root.gtag("event", safeEventName, safeParams);
                return true;
            } catch (error) {
                return false;
            }
        }

        function trackPageView(extraParams) {
            const locationHref = locationLike && locationLike.href ? locationLike.href : "";
            const pathName = locationLike && locationLike.pathname ? locationLike.pathname : "/";
            const docTitle = typeof document !== "undefined" && typeof document.title === "string"
                ? document.title
                : "image2cpp";

            return trackEvent("page_view", Object.assign({
                page_location: locationHref,
                page_path: pathName,
                page_title: docTitle,
            }, extraParams || {}));
        }

        function trackFileUpload(file) {
            const safeFile = file || {};
            const mimeType = String(safeFile.type || "unknown").toLowerCase();
            return trackEvent("file_upload", {
                file_type: mimeType || "unknown",
                file_size_bucket: bucketFileSize(safeFile.size),
                is_gif: mimeType === "image/gif",
            });
        }

        function trackPreset(presetName) {
            return trackEvent("preset_applied", {
                preset_name: String(presetName || "unknown"),
            });
        }

        function trackExport(exportType, details) {
            const safeDetails = details && typeof details === "object" ? details : {};
            return trackEvent("conversion_exported", {
                export_type: String(exportType || "unknown"),
                output_format: String(safeDetails.outputFormat || "unknown"),
                draw_mode: String(safeDetails.drawMode || "unknown"),
            });
        }

        function trackThemeChange(mode, resolvedTheme) {
            return trackEvent("theme_toggled", {
                theme_mode: String(mode || "unknown"),
                resolved_theme: String(resolvedTheme || "unknown"),
            });
        }

        function trackTransformation(transformationType) {
            return trackEvent("transformation_applied", {
                transformation_type: String(transformationType || "unknown"),
            });
        }

        function trackSettingChange(settingName, settingValue) {
            return trackEvent("setting_changed", {
                setting_name: String(settingName || "unknown"),
                setting_value: String(settingValue || "unknown"),
            });
        }

        return {
            trackEvent,
            trackPageView,
            trackFileUpload,
            trackPreset,
            trackExport,
            trackThemeChange,
            trackTransformation,
            trackSettingChange,
            getSnapshot: () => ({
                enabled,
                measurementId,
                doNotTrackEnabled,
                isLocalHost,
            }),
        };
    }

    const api = {
        create,
    };

    if (typeof module !== "undefined" && module.exports) {
        module.exports = api;
    }

    root.Image2CppAnalyticsService = api;
})(typeof globalThis !== "undefined" ? globalThis : this);

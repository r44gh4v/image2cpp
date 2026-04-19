(function initImage2CppUrlManager(root) {
    function create() {
        const activeUrls = new Set();

        function canUseObjectUrls() {
            return typeof URL !== "undefined"
                && typeof URL.createObjectURL === "function"
                && typeof URL.revokeObjectURL === "function";
        }

        function createUrl(blob) {
            if (!canUseObjectUrls()) {
                return null;
            }

            const url = URL.createObjectURL(blob);
            activeUrls.add(url);
            return url;
        }

        function revoke(url) {
            if (!url || !activeUrls.has(url) || !canUseObjectUrls()) {
                return;
            }

            URL.revokeObjectURL(url);
            activeUrls.delete(url);
        }

        function revokeAll() {
            if (!canUseObjectUrls()) {
                activeUrls.clear();
                return;
            }

            for (const url of activeUrls) {
                URL.revokeObjectURL(url);
            }
            activeUrls.clear();
        }

        function count() {
            return activeUrls.size;
        }

        return {
            create: createUrl,
            revoke,
            revokeAll,
            count,
        };
    }

    const api = { create };

    if (typeof module !== "undefined" && module.exports) {
        module.exports = api;
    }

    root.Image2CppUrlManager = api;
})(typeof globalThis !== "undefined" ? globalThis : this);

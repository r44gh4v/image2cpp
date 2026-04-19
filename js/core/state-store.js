(function initImage2CppStateStore(root) {
    function create(initialState) {
        const state = Object.assign({}, initialState || {});
        const listeners = new Set();

        function notify(changedKeys) {
            if (listeners.size === 0 || changedKeys.length === 0) {
                return;
            }

            const snapshot = Object.assign({}, state);
            listeners.forEach((listener) => {
                try {
                    listener(snapshot, changedKeys.slice());
                } catch (error) {
                    console.error("State listener failed", error);
                }
            });
        }

        function get(key) {
            return state[key];
        }

        function set(key, value) {
            if (Object.is(state[key], value)) {
                return;
            }

            state[key] = value;
            notify([key]);
        }

        function patch(partial) {
            if (!partial || typeof partial !== "object") {
                return;
            }

            const changedKeys = [];
            Object.entries(partial).forEach(([key, value]) => {
                if (Object.is(state[key], value)) {
                    return;
                }

                state[key] = value;
                changedKeys.push(key);
            });

            notify(changedKeys);
        }

        function snapshot() {
            return Object.assign({}, state);
        }

        function reset(nextState) {
            const merged = Object.assign({}, initialState || {}, nextState || {});
            patch(merged);
        }

        function subscribe(listener) {
            if (typeof listener !== "function") {
                return () => {};
            }

            listeners.add(listener);
            return () => {
                listeners.delete(listener);
            };
        }

        return {
            state,
            get,
            set,
            patch,
            snapshot,
            reset,
            subscribe,
        };
    }

    const api = { create };

    if (typeof module !== "undefined" && module.exports) {
        module.exports = api;
    }

    root.Image2CppStateStore = api;
})(typeof globalThis !== "undefined" ? globalThis : this);

const assert = require("assert");
const stateStoreFactory = require("../js/core/state-store.js");

const store = stateStoreFactory.create({
    a: 1,
    b: false,
});

{
    assert.strictEqual(store.get("a"), 1);
    assert.strictEqual(store.get("b"), false);
}

{
    const events = [];
    const unsubscribe = store.subscribe((snapshot, changedKeys) => {
        events.push({ snapshot, changedKeys });
    });

    store.set("a", 2);
    store.patch({ b: true, c: "ok" });
    unsubscribe();
    store.set("a", 3);

    assert.strictEqual(events.length, 2);
    assert.deepStrictEqual(events[0].changedKeys, ["a"]);
    assert.strictEqual(events[0].snapshot.a, 2);
    assert.deepStrictEqual(events[1].changedKeys.sort(), ["b", "c"]);
    assert.strictEqual(events[1].snapshot.b, true);
    assert.strictEqual(events[1].snapshot.c, "ok");
}

{
    store.reset({ a: 9 });
    const snapshot = store.snapshot();
    assert.strictEqual(snapshot.a, 9);
    assert.strictEqual(snapshot.b, false);
}

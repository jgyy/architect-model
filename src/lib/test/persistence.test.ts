import { describe, expect, test } from "vitest";

import {
    clearPersistedState,
    interpretStorageEvent,
    loadPersistedState,
    savePersistedState,
    type PersistedState,
    type StorageLike,
} from "@/lib/persistence";

function createFakeStorage(): StorageLike {
    const store = new Map<string, string>();
    return {
        getItem: (key) => store.get(key) ?? null,
        setItem: (key, value) => {
            store.set(key, value);
        },
        removeItem: (key) => {
            store.delete(key);
        },
    };
}

const sampleState: PersistedState = {
    architecture: {
        nodes: [
            {
                id: "node-cache",
                position: { x: 0, y: 0 },
                data: { label: "Cache", description: "Attacker reaches Cache" },
            },
        ],
        edges: [],
    },
    log: [
        {
            id: 1,
            input: "add node Cache",
            ok: true,
            message: 'Added node "Cache".',
        },
    ],
    stepIndex: 0,
    speedIndex: 1,
};

describe("loadPersistedState", () => {
    test("returns null when nothing has been saved yet", () => {
        const storage = createFakeStorage();

        expect(loadPersistedState(storage)).toBeNull();
    });

    test("returns the previously saved state", () => {
        const storage = createFakeStorage();
        savePersistedState(storage, sampleState);

        expect(loadPersistedState(storage)).toEqual(sampleState);
    });

    test("returns null when the stored value is invalid JSON", () => {
        const storage = createFakeStorage();
        storage.setItem("architect-model:session", "{not json");

        expect(loadPersistedState(storage)).toBeNull();
    });

    test("returns null when the stored value doesn't look like a PersistedState", () => {
        const storage = createFakeStorage();
        storage.setItem(
            "architect-model:session",
            JSON.stringify({ foo: "bar" }),
        );

        expect(loadPersistedState(storage)).toBeNull();
    });

    test("returns null when a persisted node is missing required fields", () => {
        const storage = createFakeStorage();
        storage.setItem(
            "architect-model:session",
            JSON.stringify({
                architecture: {
                    nodes: [{ id: "node-cache", data: { label: "Cache" } }],
                    edges: [],
                },
                log: [],
            }),
        );

        expect(loadPersistedState(storage)).toBeNull();
    });

    test("returns null when a persisted edge is missing required fields", () => {
        const storage = createFakeStorage();
        storage.setItem(
            "architect-model:session",
            JSON.stringify({
                architecture: {
                    nodes: sampleState.architecture.nodes,
                    edges: [{ id: "edge-1" }],
                },
                log: [],
            }),
        );

        expect(loadPersistedState(storage)).toBeNull();
    });

    test("ignores a leftover legacy `trace` array instead of validating it", () => {
        const storage = createFakeStorage();
        storage.setItem(
            "architect-model:session",
            JSON.stringify({
                architecture: sampleState.architecture,
                log: [],
                trace: [{ step: 1, nodeId: "node-cache" }],
                stepIndex: 0,
                speedIndex: 1,
            }),
        );

        expect(loadPersistedState(storage)).toEqual({
            architecture: sampleState.architecture,
            log: [],
            stepIndex: 0,
            speedIndex: 1,
        });
    });

    test("accepts a node without a description, for architectures saved before descriptions existed", () => {
        const storage = createFakeStorage();
        storage.setItem(
            "architect-model:session",
            JSON.stringify({
                architecture: {
                    nodes: [
                        {
                            id: "node-cache",
                            position: { x: 0, y: 0 },
                            data: { label: "Cache" },
                        },
                    ],
                    edges: [],
                },
                log: [],
                stepIndex: 0,
                speedIndex: 1,
            }),
        );

        expect(loadPersistedState(storage)?.architecture.nodes[0].data).toEqual(
            { label: "Cache" },
        );
    });

    test("returns null when a persisted log entry is missing a numeric id", () => {
        const storage = createFakeStorage();
        storage.setItem(
            "architect-model:session",
            JSON.stringify({
                architecture: sampleState.architecture,
                log: [
                    {
                        input: "add node Cache",
                        ok: true,
                        message: 'Added node "Cache".',
                    },
                ],
            }),
        );

        expect(loadPersistedState(storage)).toBeNull();
    });

    test("salvages a legacy session that has only architecture and log, defaulting the newer fields", () => {
        const storage = createFakeStorage();
        storage.setItem(
            "architect-model:session",
            JSON.stringify({
                architecture: sampleState.architecture,
                log: sampleState.log,
            }),
        );

        expect(loadPersistedState(storage)).toEqual({
            architecture: sampleState.architecture,
            log: sampleState.log,
            stepIndex: 0,
            speedIndex: 1,
        });
    });

    test("returns null when stepIndex is missing but speedIndex is present", () => {
        const storage = createFakeStorage();
        storage.setItem(
            "architect-model:session",
            JSON.stringify({
                architecture: sampleState.architecture,
                log: [],
                speedIndex: 1,
            }),
        );

        expect(loadPersistedState(storage)).toBeNull();
    });

    test("returns null when speedIndex is not a number", () => {
        const storage = createFakeStorage();
        storage.setItem(
            "architect-model:session",
            JSON.stringify({
                architecture: sampleState.architecture,
                log: [],
                stepIndex: 0,
                speedIndex: "1x",
            }),
        );

        expect(loadPersistedState(storage)).toBeNull();
    });
});

describe("storage errors", () => {
    function createThrowingStorage(): StorageLike {
        return {
            getItem: () => {
                throw new Error("SecurityError");
            },
            setItem: () => {
                throw new Error("QuotaExceededError");
            },
            removeItem: () => {
                throw new Error("SecurityError");
            },
        };
    }

    test("loadPersistedState returns null instead of throwing when storage.getItem throws", () => {
        expect(loadPersistedState(createThrowingStorage())).toBeNull();
    });

    test("savePersistedState does not throw when storage.setItem throws", () => {
        expect(() =>
            savePersistedState(createThrowingStorage(), sampleState),
        ).not.toThrow();
    });

    test("clearPersistedState does not throw when storage.removeItem throws", () => {
        expect(() =>
            clearPersistedState(createThrowingStorage()),
        ).not.toThrow();
    });
});

describe("clearPersistedState", () => {
    test("removes a previously saved state", () => {
        const storage = createFakeStorage();
        savePersistedState(storage, sampleState);

        clearPersistedState(storage);

        expect(loadPersistedState(storage)).toBeNull();
    });
});

describe("interpretStorageEvent", () => {
    test("ignores a change to an unrelated storage key", () => {
        expect(
            interpretStorageEvent(
                "some-other-key",
                JSON.stringify(sampleState),
            ),
        ).toEqual({ type: "irrelevant" });
    });

    test("reports a cleared change when the key is removed", () => {
        expect(interpretStorageEvent("architect-model:session", null)).toEqual({
            type: "cleared",
        });
    });

    test("reports a cleared change when localStorage.clear() fires a null-key event", () => {
        expect(interpretStorageEvent(null, null)).toEqual({ type: "cleared" });
    });

    test("reports invalid when the new value isn't valid JSON", () => {
        expect(
            interpretStorageEvent("architect-model:session", "{not json"),
        ).toEqual({ type: "invalid" });
    });

    test("reports invalid when the new value doesn't look like a PersistedState", () => {
        expect(
            interpretStorageEvent(
                "architect-model:session",
                JSON.stringify({ foo: "bar" }),
            ),
        ).toEqual({ type: "invalid" });
    });

    test("reports the parsed state for a valid update", () => {
        expect(
            interpretStorageEvent(
                "architect-model:session",
                JSON.stringify(sampleState),
            ),
        ).toEqual({ type: "updated", state: sampleState });
    });
});

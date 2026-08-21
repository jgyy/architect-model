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
                data: { label: "Cache" },
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
    trace: [
        {
            step: 1,
            nodeId: "node-cache",
            description: "Attacker reaches Cache",
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

    test("returns null when a persisted trace step is missing required fields", () => {
        const storage = createFakeStorage();
        storage.setItem(
            "architect-model:session",
            JSON.stringify({
                architecture: sampleState.architecture,
                log: [],
                trace: [{ step: 1, nodeId: "node-cache" }],
            }),
        );

        expect(loadPersistedState(storage)).toBeNull();
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

    test("returns null when stepIndex is missing", () => {
        const storage = createFakeStorage();
        storage.setItem(
            "architect-model:session",
            JSON.stringify({
                architecture: sampleState.architecture,
                log: [],
                trace: [],
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
                trace: [],
                stepIndex: 0,
                speedIndex: "1x",
            }),
        );

        expect(loadPersistedState(storage)).toBeNull();
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
            interpretStorageEvent("some-other-key", JSON.stringify(sampleState)),
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

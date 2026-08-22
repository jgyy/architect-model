import { describe, expect, test } from "vitest";

import {
    DEFAULT_SPEED_INDEX,
    PLAY_SPEEDS,
    clampStepIndex,
    getNextPlayIndex,
    getTraversedPath,
    stepDescription,
} from "@/lib/simulation";
import type { Architecture } from "@/types/architecture";

describe("clampStepIndex", () => {
    test("returns the index unchanged when already in bounds", () => {
        expect(clampStepIndex(1, 3)).toBe(1);
    });

    test("clamps negative indexes up to 0", () => {
        expect(clampStepIndex(-1, 3)).toBe(0);
    });

    test("clamps indexes past the end down to the last valid index", () => {
        expect(clampStepIndex(5, 3)).toBe(2);
    });

    test("clamps to 0 when there are no steps", () => {
        expect(clampStepIndex(0, 0)).toBe(0);
    });
});

describe("stepDescription", () => {
    test("returns the node's own description when present", () => {
        const node = {
            id: "node-web-server",
            position: { x: 0, y: 0 },
            data: {
                label: "Web Server",
                description: "Attacker reaches Web Server",
            },
        };

        expect(stepDescription(node)).toBe("Attacker reaches Web Server");
    });

    test("falls back to a generated description when the node has none", () => {
        const node = {
            id: "node-web-server",
            position: { x: 0, y: 0 },
            data: { label: "Web Server" },
        };

        expect(stepDescription(node)).toBe('Reaches "Web Server".');
    });
});

describe("PLAY_SPEEDS", () => {
    test("DEFAULT_SPEED_INDEX points at the 1x entry", () => {
        expect(PLAY_SPEEDS[DEFAULT_SPEED_INDEX].label).toBe("1x");
    });

    test("is a valid index into PLAY_SPEEDS", () => {
        expect(DEFAULT_SPEED_INDEX).toBeGreaterThanOrEqual(0);
        expect(DEFAULT_SPEED_INDEX).toBeLessThan(PLAY_SPEEDS.length);
    });
});

describe("getTraversedPath", () => {
    const architecture: Architecture = {
        nodes: [
            {
                id: "node-a",
                position: { x: 0, y: 0 },
                data: { label: "A", description: "Starts at A" },
            },
            {
                id: "node-b",
                position: { x: 0, y: 0 },
                data: { label: "B", description: "Reaches B" },
            },
            {
                id: "node-c",
                position: { x: 0, y: 0 },
                data: { label: "C", description: "Reaches C" },
            },
        ],
        edges: [
            { id: "edge-ab", source: "node-a", target: "node-b" },
            { id: "edge-bc", source: "node-b", target: "node-c" },
        ],
    };

    test("at the first step, only that step's node is traversed and no edges", () => {
        const result = getTraversedPath(architecture, 0);
        expect(result.nodeIds).toEqual(new Set(["node-a"]));
        expect(result.edgeIds).toEqual(new Set());
    });

    test("includes every node and connecting edge up to the current step", () => {
        const result = getTraversedPath(architecture, 1);
        expect(result.nodeIds).toEqual(new Set(["node-a", "node-b"]));
        expect(result.edgeIds).toEqual(new Set(["edge-ab"]));
    });

    test("at the last step, the full path is traversed", () => {
        const result = getTraversedPath(architecture, 2);
        expect(result.nodeIds).toEqual(new Set(["node-a", "node-b", "node-c"]));
        expect(result.edgeIds).toEqual(new Set(["edge-ab", "edge-bc"]));
    });

    test("skips a step pair with no connecting edge but still counts both nodes", () => {
        const brokenArchitecture: Architecture = {
            nodes: architecture.nodes,
            edges: [{ id: "edge-ab", source: "node-a", target: "node-b" }],
        };
        const result = getTraversedPath(brokenArchitecture, 2);
        expect(result.nodeIds).toEqual(new Set(["node-a", "node-b", "node-c"]));
        expect(result.edgeIds).toEqual(new Set(["edge-ab"]));
    });

    test("returns empty sets for an architecture with no nodes", () => {
        const result = getTraversedPath({ nodes: [], edges: [] }, 0);
        expect(result.nodeIds).toEqual(new Set());
        expect(result.edgeIds).toEqual(new Set());
    });
});

describe("getNextPlayIndex", () => {
    test("returns the following index when not at the last step", () => {
        expect(getNextPlayIndex(0, 3)).toBe(1);
    });

    test("returns null when already at the last step", () => {
        expect(getNextPlayIndex(2, 3)).toBeNull();
    });

    test("returns null when the trace is empty", () => {
        expect(getNextPlayIndex(0, 0)).toBeNull();
    });
});

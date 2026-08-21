import { describe, expect, test } from "vitest";

import { clampStepIndex, resolveStepNode } from "@/lib/simulation";
import type { Architecture } from "@/types/architecture";
import type { SimulationStep } from "@/types/simulation";

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

describe("resolveStepNode", () => {
    const architecture: Architecture = {
        nodes: [
            {
                id: "node-web-server",
                position: { x: 0, y: 0 },
                data: { label: "Web Server" },
            },
        ],
        edges: [],
    };

    test("returns the node the step points to when it exists", () => {
        const step: SimulationStep = {
            step: 1,
            nodeId: "node-web-server",
            description: "Attacker reaches Web Server",
        };

        expect(resolveStepNode(step, architecture)?.data.label).toBe(
            "Web Server",
        );
    });

    test("returns undefined when the step's node was removed from the architecture", () => {
        const step: SimulationStep = {
            step: 2,
            nodeId: "node-database",
            description: "Attacker accesses Database",
        };

        expect(resolveStepNode(step, architecture)).toBeUndefined();
    });
});

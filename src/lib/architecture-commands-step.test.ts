import { describe, expect, test } from "vitest";

import { parseCommand } from "@/lib/architecture-commands";
import type { Architecture } from "@/types/architecture";
import type { SimulationTrace } from "@/types/simulation";

const emptyArchitecture: Architecture = { nodes: [], edges: [] };

describe("parseCommand — trace step commands", () => {
    test("reports an ambiguous label when adding a step whose reference matches multiple nodes", () => {
        const architecture: Architecture = {
            nodes: [
                {
                    id: "node-web-server",
                    position: { x: 0, y: 0 },
                    data: { label: "Web Server" },
                },
                {
                    id: "node-app-server",
                    position: { x: 250, y: 0 },
                    data: { label: "App Server" },
                },
            ],
            edges: [],
        };

        const result = parseCommand("add step Server", architecture, []);

        expect(result.ok).toBe(false);
        if (result.ok) throw new Error("expected an ambiguous-label failure");
        expect(result.message).toContain("multiple nodes");
    });

    test("adds a step pointing to an existing node with an auto-generated description", () => {
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

        const result = parseCommand("add step Web Server", architecture, []);

        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.architecture).toEqual(architecture);
        expect(result.trace).toEqual([
            {
                step: 1,
                nodeId: "node-web-server",
                description: 'Reaches "Web Server".',
            },
        ]);
    });

    test("appends a step after existing ones, numbering it contiguously", () => {
        const architecture: Architecture = {
            nodes: [
                {
                    id: "node-web-server",
                    position: { x: 0, y: 0 },
                    data: { label: "Web Server" },
                },
                {
                    id: "node-database",
                    position: { x: 250, y: 0 },
                    data: { label: "Database" },
                },
            ],
            edges: [],
        };
        const trace: SimulationTrace = [
            {
                step: 1,
                nodeId: "node-web-server",
                description: "Starts at Web Server",
            },
        ];

        const result = parseCommand("add step Database", architecture, trace);

        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.trace).toHaveLength(2);
        expect(result.trace[1]).toMatchObject({
            step: 2,
            nodeId: "node-database",
        });
    });

    test("fails to add a step for a node that doesn't exist", () => {
        const result = parseCommand("add step Cache", emptyArchitecture, []);

        expect(result.ok).toBe(false);
        if (result.ok) throw new Error("expected add step to fail");
        expect(result.message).toBe('No node named "Cache".');
    });

    test("rejects adding a step with no node reference", () => {
        const result = parseCommand("add step", emptyArchitecture, []);

        expect(result.ok).toBe(false);
        if (result.ok) throw new Error("expected blank step to be rejected");
        expect(result.message).toBe("A step must reference a node.");
    });

    test("updates a step's description by its 1-indexed position", () => {
        const trace: SimulationTrace = [
            {
                step: 1,
                nodeId: "node-web-server",
                description: "old description",
            },
        ];

        const result = parseCommand(
            "set step 1 description Attacker pivots to Web Server",
            emptyArchitecture,
            trace,
        );

        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.trace).toEqual([
            {
                step: 1,
                nodeId: "node-web-server",
                description: "Attacker pivots to Web Server",
            },
        ]);
    });

    test("rejects setting a step's description to blank", () => {
        const trace: SimulationTrace = [
            { step: 1, nodeId: "node-web-server", description: "old" },
        ];

        const result = parseCommand(
            "set step 1 description",
            emptyArchitecture,
            trace,
        );

        expect(result.ok).toBe(false);
        if (result.ok)
            throw new Error("expected blank description to be rejected");
        expect(result.message).toBe("A step description cannot be blank.");
    });

    test("fails to set the description of a step number that doesn't exist", () => {
        const result = parseCommand(
            "set step 1 description Anything",
            emptyArchitecture,
            [],
        );

        expect(result.ok).toBe(false);
        if (result.ok) throw new Error("expected out-of-range step to fail");
        expect(result.message).toBe("No step numbered 1.");
    });

    test("removes a step by its 1-indexed position, renumbering the rest", () => {
        const trace: SimulationTrace = [
            { step: 1, nodeId: "node-a", description: "first" },
            { step: 2, nodeId: "node-b", description: "second" },
            { step: 3, nodeId: "node-c", description: "third" },
        ];

        const result = parseCommand("remove step 2", emptyArchitecture, trace);

        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.trace).toEqual([
            { step: 1, nodeId: "node-a", description: "first" },
            { step: 2, nodeId: "node-c", description: "third" },
        ]);
    });

    test("fails to remove a step number that doesn't exist", () => {
        const result = parseCommand("remove step 5", emptyArchitecture, []);

        expect(result.ok).toBe(false);
        if (result.ok) throw new Error("expected out-of-range remove to fail");
        expect(result.message).toBe("No step numbered 5.");
    });

    test("inserts a step at a given position, shifting later steps and renumbering", () => {
        const architecture: Architecture = {
            nodes: [
                {
                    id: "node-cache",
                    position: { x: 0, y: 0 },
                    data: { label: "Cache" },
                },
            ],
            edges: [],
        };
        const trace: SimulationTrace = [
            { step: 1, nodeId: "node-a", description: "first" },
            { step: 2, nodeId: "node-b", description: "second" },
        ];

        const result = parseCommand("insert step 2 Cache", architecture, trace);

        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.trace).toEqual([
            { step: 1, nodeId: "node-a", description: "first" },
            {
                step: 2,
                nodeId: "node-cache",
                description: 'Reaches "Cache".',
            },
            { step: 3, nodeId: "node-b", description: "second" },
        ]);
    });

    test("inserts a step at the start when position is 1", () => {
        const architecture: Architecture = {
            nodes: [
                {
                    id: "node-cache",
                    position: { x: 0, y: 0 },
                    data: { label: "Cache" },
                },
            ],
            edges: [],
        };
        const trace: SimulationTrace = [
            { step: 1, nodeId: "node-a", description: "first" },
        ];

        const result = parseCommand("insert step 1 Cache", architecture, trace);

        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.trace.map((step) => step.nodeId)).toEqual([
            "node-cache",
            "node-a",
        ]);
    });

    test("inserting one past the last position behaves like appending", () => {
        const architecture: Architecture = {
            nodes: [
                {
                    id: "node-cache",
                    position: { x: 0, y: 0 },
                    data: { label: "Cache" },
                },
            ],
            edges: [],
        };
        const trace: SimulationTrace = [
            { step: 1, nodeId: "node-a", description: "first" },
        ];

        const result = parseCommand("insert step 2 Cache", architecture, trace);

        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.trace.map((step) => step.nodeId)).toEqual([
            "node-a",
            "node-cache",
        ]);
    });

    test("fails to insert a step at an out-of-range position", () => {
        const architecture: Architecture = {
            nodes: [
                {
                    id: "node-cache",
                    position: { x: 0, y: 0 },
                    data: { label: "Cache" },
                },
            ],
            edges: [],
        };
        const trace: SimulationTrace = [
            { step: 1, nodeId: "node-a", description: "first" },
        ];

        const result = parseCommand("insert step 4 Cache", architecture, trace);

        expect(result.ok).toBe(false);
        if (result.ok) throw new Error("expected out-of-range insert to fail");
        expect(result.message).toBe(
            "No position numbered 4; valid positions are 1-2.",
        );
    });

    test("fails to insert a step for a node that doesn't exist", () => {
        const result = parseCommand(
            "insert step 1 Cache",
            emptyArchitecture,
            [],
        );

        expect(result.ok).toBe(false);
        if (result.ok) throw new Error("expected insert step to fail");
        expect(result.message).toBe('No node named "Cache".');
    });

    test("rejects inserting a step with no node reference", () => {
        const result = parseCommand("insert step 1", emptyArchitecture, []);

        expect(result.ok).toBe(false);
        if (result.ok) throw new Error("expected blank insert to be rejected");
        expect(result.message).toBe("A step must reference a node.");
    });

    test("reports an ambiguous label when inserting a step whose reference matches multiple nodes", () => {
        const architecture: Architecture = {
            nodes: [
                {
                    id: "node-web-server",
                    position: { x: 0, y: 0 },
                    data: { label: "Web Server" },
                },
                {
                    id: "node-app-server",
                    position: { x: 250, y: 0 },
                    data: { label: "App Server" },
                },
            ],
            edges: [],
        };

        const result = parseCommand("insert step 1 Server", architecture, []);

        expect(result.ok).toBe(false);
        if (result.ok) throw new Error("expected an ambiguous-label failure");
        expect(result.message).toContain("multiple nodes");
    });

    test("moves a step forward, renumbering the trace", () => {
        const trace: SimulationTrace = [
            { step: 1, nodeId: "node-a", description: "first" },
            { step: 2, nodeId: "node-b", description: "second" },
            { step: 3, nodeId: "node-c", description: "third" },
        ];

        const result = parseCommand(
            "move step 1 to 3",
            emptyArchitecture,
            trace,
        );

        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.trace).toEqual([
            { step: 1, nodeId: "node-b", description: "second" },
            { step: 2, nodeId: "node-c", description: "third" },
            { step: 3, nodeId: "node-a", description: "first" },
        ]);
    });

    test("moves a step backward, renumbering the trace", () => {
        const trace: SimulationTrace = [
            { step: 1, nodeId: "node-a", description: "first" },
            { step: 2, nodeId: "node-b", description: "second" },
            { step: 3, nodeId: "node-c", description: "third" },
        ];

        const result = parseCommand(
            "move step 3 to 1",
            emptyArchitecture,
            trace,
        );

        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.trace).toEqual([
            { step: 1, nodeId: "node-c", description: "third" },
            { step: 2, nodeId: "node-a", description: "first" },
            { step: 3, nodeId: "node-b", description: "second" },
        ]);
    });

    test("moving a step to its own position is a no-op", () => {
        const trace: SimulationTrace = [
            { step: 1, nodeId: "node-a", description: "first" },
            { step: 2, nodeId: "node-b", description: "second" },
        ];

        const result = parseCommand(
            "move step 2 to 2",
            emptyArchitecture,
            trace,
        );

        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.trace).toEqual(trace);
        expect(result.message).toBe("Step 2 is already at position 2.");
    });

    test("fails to move a step from a position that doesn't exist", () => {
        const trace: SimulationTrace = [
            { step: 1, nodeId: "node-a", description: "first" },
        ];

        const result = parseCommand(
            "move step 5 to 1",
            emptyArchitecture,
            trace,
        );

        expect(result.ok).toBe(false);
        if (result.ok) throw new Error("expected out-of-range move to fail");
        expect(result.message).toBe("No step numbered 5.");
    });

    test("fails to move a step to a position that doesn't exist", () => {
        const trace: SimulationTrace = [
            { step: 1, nodeId: "node-a", description: "first" },
        ];

        const result = parseCommand(
            "move step 1 to 5",
            emptyArchitecture,
            trace,
        );

        expect(result.ok).toBe(false);
        if (result.ok) throw new Error("expected out-of-range move to fail");
        expect(result.message).toBe("No step numbered 5.");
    });
});

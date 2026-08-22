import { describe, expect, test } from "vitest";

import { parseCommand } from "@/lib/architecture-commands";
import type { Architecture } from "@/types/architecture";

function architectureOf(...labels: string[]): Architecture {
    return {
        nodes: labels.map((label, index) => ({
            id: `node-${index}`,
            position: { x: index * 250, y: 0 },
            data: { label, description: `Reaches "${label}".` },
        })),
        edges: [],
    };
}

describe("parseCommand - move node <label> to step <n>", () => {
    test("moves the node later, shifting the nodes in between earlier", () => {
        const architecture = architectureOf("A", "B", "C", "D");

        const result = parseCommand("move node A to step 3", architecture);

        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.architecture.nodes.map((n) => n.data.label)).toEqual([
            "B",
            "C",
            "A",
            "D",
        ]);
        expect(result.message).toBe('Moved "A" to step 3.');
    });

    test("moves the node earlier, shifting the nodes in between later", () => {
        const architecture = architectureOf("A", "B", "C", "D");

        const result = parseCommand("move node D to step 2", architecture);

        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.architecture.nodes.map((n) => n.data.label)).toEqual([
            "A",
            "D",
            "B",
            "C",
        ]);
    });

    test("the 'reorder node' alias behaves identically", () => {
        const architecture = architectureOf("A", "B", "C");

        const result = parseCommand("reorder node C to step 1", architecture);

        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.architecture.nodes.map((n) => n.data.label)).toEqual([
            "C",
            "A",
            "B",
        ]);
    });

    test("matches node references case-insensitively and by substring", () => {
        const architecture = architectureOf("Web Server", "Database");

        const result = parseCommand("move node web to step 2", architecture);

        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.architecture.nodes.map((n) => n.data.label)).toEqual([
            "Database",
            "Web Server",
        ]);
    });

    test("rejects a reference to a node that doesn't exist", () => {
        const architecture = architectureOf("A", "B");

        const result = parseCommand(
            "move node Missing to step 1",
            architecture,
        );

        expect(result.ok).toBe(false);
        if (result.ok) return;
        expect(result.message).toBe('No node named "Missing".');
    });

    test("rejects an ambiguous node reference", () => {
        const architecture = architectureOf("Cache A", "Cache B");

        const result = parseCommand("move node Cache to step 1", architecture);

        expect(result.ok).toBe(false);
        if (result.ok) return;
        expect(result.message).toContain("matches multiple nodes");
    });

    test("rejects a non-numeric step number", () => {
        const architecture = architectureOf("A", "B");

        const result = parseCommand("move node A to step two", architecture);

        expect(result.ok).toBe(false);
        if (result.ok) return;
        expect(result.message).toBe(
            '"two" isn\'t a valid step number. Try: move node <label> to step <n>.',
        );
    });

    test("rejects a step number below 1", () => {
        const architecture = architectureOf("A", "B");

        const result = parseCommand("move node A to step 0", architecture);

        expect(result.ok).toBe(false);
        if (result.ok) return;
        expect(result.message).toBe(
            "Step 0 is out of range (architecture has 2 steps).",
        );
    });

    test("rejects a step number past the end", () => {
        const architecture = architectureOf("A", "B");

        const result = parseCommand("move node A to step 5", architecture);

        expect(result.ok).toBe(false);
        if (result.ok) return;
        expect(result.message).toBe(
            "Step 5 is out of range (architecture has 2 steps).",
        );
    });

    test("rejects moving a node to the step it's already at", () => {
        const architecture = architectureOf("A", "B", "C");

        const result = parseCommand("move node B to step 2", architecture);

        expect(result.ok).toBe(false);
        if (result.ok) return;
        expect(result.message).toBe('"B" is already step 2.');
    });

    test("rejects a command missing the 'to step' separator", () => {
        const architecture = architectureOf("A", "B");

        const result = parseCommand("move node A", architecture);

        expect(result.ok).toBe(false);
        if (result.ok) return;
        expect(result.message).toContain('"to step" separator');
    });
});

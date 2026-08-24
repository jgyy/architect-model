import { describe, expect, test } from "vitest";

import { parseCommand } from "@/lib/architecture-commands";
import type { Architecture } from "@/types/architecture";

const emptyArchitecture: Architecture = { nodes: [], edges: [] };

describe("parseCommand - rename node commands", () => {
    test("rejects renaming a node to a label over the max length", () => {
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
        const longLabel = "x".repeat(201);

        const result = parseCommand(
            `rename node Web Server to ${longLabel}`,
            architecture,
        );

        expect(result.ok).toBe(false);
        if (result.ok)
            throw new Error("expected an over-length label to be rejected");
        expect(result.message).toBe(
            "A node label can be at most 200 characters (got 201).",
        );
    });

    test("renames a node to a new label", () => {
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

        const result = parseCommand(
            "rename node Web Server to Frontend",
            architecture,
        );

        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.architecture.nodes[0].id).toBe("node-web-server");
        expect(result.architecture.nodes[0].data.label).toBe("Frontend");
        expect(result.message).toBe('Renamed "Web Server" to "Frontend".');
    });

    test("updates a node's default simulation description to match its new label", () => {
        const architecture: Architecture = {
            nodes: [
                {
                    id: "node-web-server",
                    position: { x: 0, y: 0 },
                    data: {
                        label: "Web Server",
                        description: 'Reaches "Web Server".',
                    },
                },
            ],
            edges: [],
        };

        const result = parseCommand(
            "rename node Web Server to Frontend",
            architecture,
        );

        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.architecture.nodes[0].data.description).toBe(
            'Reaches "Frontend".',
        );
    });

    test("preserves a node's edges across a rename", () => {
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
            edges: [
                {
                    id: "edge-web-server-database",
                    source: "node-web-server",
                    target: "node-database",
                },
            ],
        };

        const result = parseCommand(
            "rename node Web Server to Frontend",
            architecture,
        );

        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.architecture.edges).toEqual(architecture.edges);
    });

    test("fails to rename a node that does not exist", () => {
        const result = parseCommand(
            "rename node Cache to Redis",
            emptyArchitecture,
        );

        expect(result.ok).toBe(false);
        if (result.ok) throw new Error("expected rename to fail");
        expect(result.message).toBe('No node named "Cache".');
    });

    test("reports an ambiguous label when renaming a node whose reference matches multiple nodes", () => {
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

        const result = parseCommand(
            "rename node Server to Frontend",
            architecture,
        );

        expect(result.ok).toBe(false);
        if (result.ok) throw new Error("expected an ambiguous-label failure");
        expect(result.message).toContain("Web Server");
        expect(result.message).toContain("App Server");
        expect(result.message).toContain("multiple nodes");
    });

    test("rejects renaming to a blank label", () => {
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

        // trailing zero-width space so a "to" separator is still found
        const result = parseCommand(
            `rename node Web Server to ${"​"}`,
            architecture,
        );

        expect(result.ok).toBe(false);
        if (result.ok)
            throw new Error("expected blank new label to be rejected");
        expect(result.message).toBe("A node label cannot be blank.");
    });

    test("rejects a plain trailing 'to' with nothing after it (no zero-width space) as a blank label, not a missing separator", () => {
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

        // The outer trim()
        const result = parseCommand("rename node Web Server to", architecture);

        expect(result.ok).toBe(false);
        if (result.ok)
            throw new Error("expected blank new label to be rejected");
        expect(result.message).toBe("A node label cannot be blank.");
    });

    test("rejects a plain trailing 'to' for a source label that itself contains a separator word", () => {
        const architecture: Architecture = {
            nodes: [
                {
                    id: "node-point-to-point-link",
                    position: { x: 0, y: 0 },
                    data: { label: "Point to Point Link" },
                },
            ],
            edges: [],
        };

        const result = parseCommand(
            "rename node Point to Point Link to",
            architecture,
        );

        expect(result.ok).toBe(false);
        if (result.ok)
            throw new Error("expected blank new label to be rejected");
        expect(result.message).toBe("A node label cannot be blank.");
    });

    test("rejects a plain trailing 'to' when the source doesn't reference any node", () => {
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

        const result = parseCommand("rename node Ghost to", architecture);

        expect(result.ok).toBe(false);
        if (result.ok) throw new Error("expected a no-such-node failure");
        expect(result.message).toBe('No node named "Ghost".');
    });

    test("does not falsely report ambiguity for a rename reference whose full label happens to end in the separator word", () => {
        const architecture: Architecture = {
            nodes: [
                {
                    id: "node-say-to",
                    position: { x: 0, y: 0 },
                    data: { label: "Say To" },
                },
                {
                    id: "node-sayonara",
                    position: { x: 250, y: 0 },
                    data: { label: "Sayonara" },
                },
            ],
            edges: [],
        };

        const result = parseCommand("rename node Say To", architecture);

        expect(result.ok).toBe(false);
        if (result.ok) throw new Error("expected a missing-separator failure");
        expect(result.message).toContain('Couldn\'t find a "to" separator');
        expect(result.message).not.toContain("multiple nodes");
    });

    test("a trailing 'to' still resolves as a blank-target rename when the label really is just the part before it", () => {
        const architecture: Architecture = {
            nodes: [
                {
                    id: "node-say",
                    position: { x: 0, y: 0 },
                    data: { label: "Say" },
                },
            ],
            edges: [],
        };

        const result = parseCommand("rename node Say to", architecture);

        expect(result.ok).toBe(false);
        if (result.ok)
            throw new Error("expected blank new label to be rejected");
        expect(result.message).toBe("A node label cannot be blank.");
    });

    test("finds the separator even when a zero-width character lands inside the separator token itself", () => {
        const architecture: Architecture = {
            nodes: [
                { id: "a", position: { x: 0, y: 0 }, data: { label: "A" } },
                { id: "b", position: { x: 0, y: 0 }, data: { label: "B" } },
            ],
            edges: [],
        };

        const result = parseCommand(`connect A to${"​"} B`, architecture);

        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.architecture.edges).toHaveLength(1);
    });

    test("rejects renaming a node to a label already used by a different node", () => {
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

        const result = parseCommand(
            "rename node Web Server to database",
            architecture,
        );

        expect(result.ok).toBe(false);
        if (result.ok)
            throw new Error("expected duplicate label to be rejected");
        expect(result.message).toBe('A node named "Database" already exists.');
    });

    test("rejects renaming a node to the name it already has", () => {
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

        const result = parseCommand(
            "rename node Web Server to Web Server",
            architecture,
        );

        expect(result.ok).toBe(false);
        if (result.ok) throw new Error("expected no-op rename to be rejected");
        expect(result.message).toBe('"Web Server" is already named that.');
    });

    test('renaming a node whose own label contains a " to " separator uses the whole label, not a truncated prefix', () => {
        const architecture: Architecture = {
            nodes: [
                {
                    id: "node-point-to-point-link",
                    position: { x: 0, y: 0 },
                    data: { label: "Point to Point Link" },
                },
            ],
            edges: [],
        };

        const result = parseCommand(
            "rename node Point to Point Link to New Name",
            architecture,
        );

        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.architecture.nodes[0].data.label).toBe("New Name");
    });

    test('accepts "relabel node ... to ..." as an alias for rename node', () => {
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

        const result = parseCommand(
            "relabel node Web Server to Frontend",
            architecture,
        );

        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.architecture.nodes[0].data.label).toBe("Frontend");
    });
});

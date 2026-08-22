import { describe, expect, test } from "vitest";

import { parseCommand } from "@/lib/architecture-commands";
import type { Architecture } from "@/types/architecture";
import type { SimulationTrace } from "@/types/simulation";

const emptyArchitecture: Architecture = { nodes: [], edges: [] };

describe("parseCommand — node commands", () => {
    test("adds a node with the given label", () => {
        const result = parseCommand("add node Cache", emptyArchitecture);

        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.architecture.nodes).toHaveLength(1);
        expect(result.architecture.nodes[0].data.label).toBe("Cache");
    });

    test("assigns a unique id when two different labels slugify to the same value", () => {
        const withCache = parseCommand("add node Cache!", emptyArchitecture);
        if (!withCache.ok) throw new Error("expected first add to succeed");

        const result = parseCommand("add node Cache?", withCache.architecture);

        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.architecture.nodes).toHaveLength(2);
        const ids = result.architecture.nodes.map((node) => node.id);
        expect(new Set(ids).size).toBe(2);
    });

    test("does not reuse a removed node's id for a newly added node while a trace step still references the old id", () => {
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
        const trace: SimulationTrace = [
            {
                step: 1,
                nodeId: "node-web-server",
                description: "Reaches Web Server.",
            },
        ];

        const removed = parseCommand(
            "remove node Web Server",
            architecture,
            trace,
        );
        if (!removed.ok) throw new Error("expected remove node to succeed");

        const added = parseCommand(
            "add node Web Server",
            removed.architecture,
            removed.trace,
        );

        expect(added.ok).toBe(true);
        if (!added.ok) return;
        expect(added.architecture.nodes[0].id).not.toBe("node-web-server");
        // the orphaned step still points at the removed node's old id
        expect(removed.trace[0].nodeId).toBe("node-web-server");
        expect(
            added.architecture.nodes.some((n) => n.id === "node-web-server"),
        ).toBe(false);
    });

    test("removes a node and any edges connected to it", () => {
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

        const result = parseCommand("remove node Web Server", architecture);

        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.architecture.nodes).toHaveLength(1);
        expect(result.architecture.nodes[0].data.label).toBe("Database");
        expect(result.architecture.edges).toHaveLength(0);
    });

    test("fails to remove a node that does not exist", () => {
        const result = parseCommand("remove node Cache", emptyArchitecture);

        expect(result.ok).toBe(false);
        if (result.ok) throw new Error("expected remove to fail");
        expect(result.message).toBe('No node named "Cache".');
    });

    test("prefers an exact label match over a substring match", () => {
        const architecture: Architecture = {
            nodes: [
                {
                    id: "node-redis-cache",
                    position: { x: 0, y: 0 },
                    data: { label: "Redis Cache" },
                },
                {
                    id: "node-cache",
                    position: { x: 250, y: 0 },
                    data: { label: "Cache" },
                },
            ],
            edges: [],
        };

        const result = parseCommand("remove node Cache", architecture);

        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.message).toBe('Removed node "Cache".');
        expect(result.architecture.nodes).toHaveLength(1);
        expect(result.architecture.nodes[0].data.label).toBe("Redis Cache");
    });

    test("reports an ambiguous label when removing a node whose reference matches multiple nodes", () => {
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

        const result = parseCommand("remove node Server", architecture);

        expect(result.ok).toBe(false);
        if (result.ok) throw new Error("expected an ambiguous-label failure");
        expect(result.message).toContain("Web Server");
        expect(result.message).toContain("App Server");
        expect(result.message).toContain("multiple nodes");
    });

    test('accepts "create node" as an alias for adding a node', () => {
        const result = parseCommand("create node Cache", emptyArchitecture);

        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.architecture.nodes[0].data.label).toBe("Cache");
    });

    test('accepts "new node" as an alias for adding a node', () => {
        const result = parseCommand("new node Cache", emptyArchitecture);

        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.architecture.nodes[0].data.label).toBe("Cache");
    });

    test('accepts "add a node called" as an alias for adding a node', () => {
        const result = parseCommand(
            "add a node called Cache",
            emptyArchitecture,
        );

        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.architecture.nodes[0].data.label).toBe("Cache");
    });

    test("rejects adding a node with a blank label", () => {
        const result = parseCommand("add node", emptyArchitecture);

        expect(result.ok).toBe(false);
        if (result.ok) throw new Error("expected blank label to be rejected");
        expect(result.message).toBe("A node label cannot be blank.");
    });

    test("rejects adding a node whose label already exists (case-insensitive)", () => {
        const withCache = parseCommand("add node Cache", emptyArchitecture);
        if (!withCache.ok) throw new Error("expected first add to succeed");

        const result = parseCommand("add node cache", withCache.architecture);

        expect(result.ok).toBe(false);
        if (result.ok)
            throw new Error("expected duplicate label to be rejected");
        expect(result.message).toBe('A node named "Cache" already exists.');
        expect(withCache.architecture.nodes).toHaveLength(1);
    });

    test('accepts "delete node" as an alias for remove node', () => {
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

        const result = parseCommand("delete node Cache", architecture);

        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.architecture.nodes).toHaveLength(0);
    });

    test("treats labels differing only by internal whitespace as duplicates", () => {
        const withWebServer = parseCommand(
            "add node Web Server",
            emptyArchitecture,
        );
        if (!withWebServer.ok) throw new Error("expected first add to succeed");

        const result = parseCommand(
            "add node Web  Server",
            withWebServer.architecture,
        );

        expect(result.ok).toBe(false);
        if (result.ok)
            throw new Error("expected duplicate label to be rejected");
        expect(result.message).toBe(
            'A node named "Web Server" already exists.',
        );
    });

    test("collapses repeated internal whitespace when storing a new node's label", () => {
        const result = parseCommand("add node Foo   Bar", emptyArchitecture);

        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.architecture.nodes[0].data.label).toBe("Foo Bar");
    });

    test("rejects a label that differs from an existing one only by an invisible zero-width character", () => {
        const withServer = parseCommand("add node Server", emptyArchitecture);
        if (!withServer.ok) throw new Error("expected first add to succeed");

        // trailing zero-width space (U+200B) — visually identical to "Server"
        const result = parseCommand(
            `add node Server${"\u200B"}`,
            withServer.architecture,
        );

        expect(result.ok).toBe(false);
        if (result.ok)
            throw new Error("expected duplicate label to be rejected");
        expect(result.message).toBe('A node named "Server" already exists.');
        expect(withServer.architecture.nodes).toHaveLength(1);
    });

    test("rejects a label that differs from an existing one only by Unicode composition (NFC vs NFD)", () => {
        const nfc = "Caf\u00E9"; // precomposed e-acute
        const nfd = "Cafe\u0301"; // base "e" + combining acute accent
        expect(nfc).not.toBe(nfd);
        expect(nfc.normalize("NFC")).toBe(nfd.normalize("NFC"));

        const withCafe = parseCommand(`add node ${nfc}`, emptyArchitecture);
        if (!withCafe.ok) throw new Error("expected first add to succeed");

        const result = parseCommand(`add node ${nfd}`, withCafe.architecture);

        expect(result.ok).toBe(false);
        if (result.ok)
            throw new Error("expected duplicate label to be rejected");
        expect(withCafe.architecture.nodes).toHaveLength(1);
    });

    test("finds a node by label even when the reference has different internal spacing", () => {
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

        const result = parseCommand("remove node Web  Server", architecture);

        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.architecture.nodes).toHaveLength(0);
    });

    test("rejects a label made up only of invisible characters", () => {
        const result = parseCommand("add node ​", emptyArchitecture);

        expect(result.ok).toBe(false);
        if (result.ok)
            throw new Error("expected invisible-only label to be rejected");
        expect(result.message).toBe("A node label cannot be blank.");
    });
});

import { describe, expect, test } from "vitest";

import {
    buildNodeIndex,
    findNodesBySubstring,
    parseCommand,
} from "@/lib/architecture-commands";
import type { Architecture } from "@/types/architecture";

const emptyArchitecture: Architecture = { nodes: [], edges: [] };

describe("parseCommand - node commands", () => {
    test("adds a node with the given label", () => {
        const result = parseCommand("add node Cache", emptyArchitecture);

        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.architecture.nodes).toHaveLength(1);
        expect(result.architecture.nodes[0].data.label).toBe("Cache");
    });

    test("places a new node at the given position instead of the default formula", () => {
        const result = parseCommand("add node Cache", emptyArchitecture, {
            position: { x: 111, y: 222 },
        });

        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.architecture.nodes[0].position).toEqual({
            x: 111,
            y: 222,
        });
    });

    test("falls back to the default position formula when no position is given", () => {
        const result = parseCommand("add node Cache", emptyArchitecture);

        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.architecture.nodes[0].position).toEqual({ x: 0, y: 0 });
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

    test("reuses a removed node's id when a node with the same label is re-added, since nothing else references the old id", () => {
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

        const removed = parseCommand("remove node Web Server", architecture);
        if (!removed.ok) throw new Error("expected remove node to succeed");

        const added = parseCommand("add node Web Server", removed.architecture);

        expect(added.ok).toBe(true);
        if (!added.ok) return;
        expect(added.architecture.nodes[0].id).toBe("node-web-server");
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
        expect(result.message).toBe(
            'Removed node "Cache" and its simulation step.',
        );
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

    test("resolves a single node whose label contains the search substring more than once", () => {
        const architecture: Architecture = {
            nodes: [
                {
                    id: "node-banana",
                    position: { x: 0, y: 0 },
                    data: { label: "Banana Banana Cache" },
                },
            ],
            edges: [],
        };

        const result = parseCommand("remove node banana", architecture);

        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.message).toBe(
            'Removed node "Banana Banana Cache" and its simulation step.',
        );
    });

    test("finds a substring match by scanning past 20 other nodes and truncates the ambiguous list", () => {
        const nodes: Architecture["nodes"] = Array.from(
            { length: 25 },
            (_, index) => ({
                id: `node-server-${index}`,
                position: { x: index * 250, y: 0 },
                data: { label: `Server ${index}` },
            }),
        );
        const architecture: Architecture = { nodes, edges: [] };

        const result = parseCommand("remove node Server", architecture);

        expect(result.ok).toBe(false);
        if (result.ok) throw new Error("expected an ambiguous-label failure");
        expect(result.message).toContain("Server 0");
        expect(result.message).toContain("Server 19");
        expect(result.message).not.toContain("Server 20");
        expect(result.message).toContain("and 5 more");
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

        // trailing zero-width space (U+200B) - visually identical to "Server"
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

describe("findNodesBySubstring", () => {
    const architecture: Architecture = {
        nodes: [
            {
                id: "node-web-server",
                position: { x: 0, y: 0 },
                data: { label: "Web Server" },
            },
            {
                id: "node-database",
                position: { x: 0, y: 0 },
                data: { label: "Database" },
            },
        ],
        edges: [],
    };
    const nodeIndex = buildNodeIndex(architecture.nodes, architecture.edges);

    test("returns every node whose label contains the needle anywhere", () => {
        const matches = findNodesBySubstring(nodeIndex, "erv");
        expect(matches.map((node) => node.data.label)).toEqual(["Web Server"]);
    });

    test("matches a needle that only appears at the end of a label", () => {
        const matches = findNodesBySubstring(nodeIndex, "base");
        expect(matches.map((node) => node.data.label)).toEqual(["Database"]);
    });

    test("returns an empty array when no label contains the needle", () => {
        expect(findNodesBySubstring(nodeIndex, "xyz")).toEqual([]);
    });
});

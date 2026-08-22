import { describe, expect, test } from "vitest";

import { buildNodeIndex, parseCommand } from "@/lib/architecture-commands";
import type { Architecture } from "@/types/architecture";

describe("parseCommand - edge commands", () => {
    test("connects two existing nodes by label", () => {
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
            "connect Web Server to Database",
            architecture,
        );

        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.architecture.edges).toHaveLength(1);
        expect(result.architecture.edges[0]).toMatchObject({
            source: "node-web-server",
            target: "node-database",
        });
    });

    test("fails to connect when a node does not exist", () => {
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
            "connect Web Server to Database",
            architecture,
        );

        expect(result.ok).toBe(false);
        if (result.ok) throw new Error("expected connect to fail");
        expect(result.message).toContain("Database");
    });

    test("removes an edge between two nodes", () => {
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
            "remove edge Web Server to Database",
            architecture,
        );

        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.architecture.edges).toHaveLength(0);
        expect(result.architecture.nodes).toHaveLength(2);
    });

    test("fails to remove an edge that does not exist", () => {
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
            "remove edge Web Server to Database",
            architecture,
        );

        expect(result.ok).toBe(false);
        if (result.ok) throw new Error("expected remove edge to fail");
        expect(result.message).toBe('No edge from "Web Server" to "Database".');
    });

    test("rejects connecting a node to itself", () => {
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
            "connect Web Server to Web Server",
            architecture,
        );

        expect(result.ok).toBe(false);
        if (result.ok) throw new Error("expected self-connect to fail");
        expect(result.message).toBe('"Web Server" can\'t connect to itself.');
        expect(architecture.edges).toHaveLength(0);
    });

    test("rejects a second outgoing edge from a node that already has one (fan-out)", () => {
        const architecture: Architecture = {
            nodes: [
                {
                    id: "node-a",
                    position: { x: 0, y: 0 },
                    data: { label: "A" },
                },
                {
                    id: "node-b",
                    position: { x: 250, y: 0 },
                    data: { label: "B" },
                },
                {
                    id: "node-c",
                    position: { x: 500, y: 0 },
                    data: { label: "C" },
                },
            ],
            edges: [{ id: "edge-a-b", source: "node-a", target: "node-b" }],
        };

        const result = parseCommand("connect A to C", architecture);

        expect(result.ok).toBe(false);
        if (result.ok) throw new Error("expected fan-out connect to fail");
        expect(result.message).toBe(
            '"A" already connects to "B"; a node can have only one outgoing connection.',
        );
    });

    test("rejects a second incoming edge into a node that already has one (fan-in)", () => {
        const architecture: Architecture = {
            nodes: [
                {
                    id: "node-a",
                    position: { x: 0, y: 0 },
                    data: { label: "A" },
                },
                {
                    id: "node-b",
                    position: { x: 250, y: 0 },
                    data: { label: "B" },
                },
                {
                    id: "node-c",
                    position: { x: 500, y: 0 },
                    data: { label: "C" },
                },
            ],
            edges: [{ id: "edge-a-c", source: "node-a", target: "node-c" }],
        };

        const result = parseCommand("connect B to C", architecture);

        expect(result.ok).toBe(false);
        if (result.ok) throw new Error("expected fan-in connect to fail");
        expect(result.message).toBe(
            '"C" is already reached from "A"; a node can have only one incoming connection.',
        );
    });

    test("rejects a connection that would close a multi-node cycle", () => {
        const architecture: Architecture = {
            nodes: [
                {
                    id: "node-a",
                    position: { x: 0, y: 0 },
                    data: { label: "A" },
                },
                {
                    id: "node-b",
                    position: { x: 250, y: 0 },
                    data: { label: "B" },
                },
                {
                    id: "node-c",
                    position: { x: 500, y: 0 },
                    data: { label: "C" },
                },
            ],
            edges: [
                { id: "edge-a-b", source: "node-a", target: "node-b" },
                { id: "edge-b-c", source: "node-b", target: "node-c" },
            ],
        };

        const result = parseCommand("connect C to A", architecture);

        expect(result.ok).toBe(false);
        if (result.ok) throw new Error("expected cyclic connect to fail");
        expect(result.message).toBe(
            'Connecting "C" to "A" would create a circular loop.',
        );
    });

    test("allows joining the tail of one chain to the head of another (no cycle, no fan-out/fan-in violation)", () => {
        const architecture: Architecture = {
            nodes: [
                {
                    id: "node-a",
                    position: { x: 0, y: 0 },
                    data: { label: "A" },
                },
                {
                    id: "node-b",
                    position: { x: 250, y: 0 },
                    data: { label: "B" },
                },
                {
                    id: "node-x",
                    position: { x: 500, y: 0 },
                    data: { label: "X" },
                },
                {
                    id: "node-y",
                    position: { x: 750, y: 0 },
                    data: { label: "Y" },
                },
            ],
            edges: [
                { id: "edge-a-b", source: "node-a", target: "node-b" },
                { id: "edge-x-y", source: "node-x", target: "node-y" },
            ],
        };

        const result = parseCommand("connect B to X", architecture);

        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.architecture.edges).toHaveLength(3);
    });

    test("rejects connecting the same two nodes twice instead of creating a duplicate edge", () => {
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
        const first = parseCommand(
            "connect Web Server to Database",
            architecture,
        );
        if (!first.ok) throw new Error("expected first connect to succeed");

        const result = parseCommand(
            "connect Web Server to Database",
            first.architecture,
        );

        expect(result.ok).toBe(false);
        if (result.ok) throw new Error("expected duplicate connect to fail");
        expect(result.message).toBe(
            'An edge from "Web Server" to "Database" already exists.',
        );
        expect(first.architecture.edges).toHaveLength(1);
    });

    test('resolves connection labels correctly even when a label contains the word "to"', () => {
        const architecture: Architecture = {
            nodes: [
                {
                    id: "node-client",
                    position: { x: 0, y: 0 },
                    data: { label: "Client" },
                },
                {
                    id: "node-point-to-point-link",
                    position: { x: 250, y: 0 },
                    data: { label: "Point to Point Link" },
                },
            ],
            edges: [],
        };

        const result = parseCommand(
            "connect Client to Point to Point Link",
            architecture,
        );

        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.architecture.edges[0]).toMatchObject({
            source: "node-client",
            target: "node-point-to-point-link",
        });
    });

    test("reports a missing node (not a missing edge) when remove edge references an unknown node", () => {
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
            "remove edge Web Server to Databasee",
            architecture,
        );

        expect(result.ok).toBe(false);
        if (result.ok) throw new Error("expected remove edge to fail");
        expect(result.message).toBe('No node named "Databasee".');
    });

    test("reports an ambiguous label instead of silently connecting the wrong node when a connect reference matches multiple nodes", () => {
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
                {
                    id: "node-database",
                    position: { x: 500, y: 0 },
                    data: { label: "Database" },
                },
            ],
            edges: [],
        };

        const result = parseCommand("connect Server to Database", architecture);

        expect(result.ok).toBe(false);
        if (result.ok) throw new Error("expected an ambiguous-label failure");
        expect(result.message).toContain("Web Server");
        expect(result.message).toContain("App Server");
        expect(result.message).toContain("multiple nodes");
        expect(architecture.edges).toHaveLength(0);
    });

    test("reports an ambiguous label instead of falsely claiming no edge exists when a remove-edge reference matches multiple nodes", () => {
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
                {
                    id: "node-database",
                    position: { x: 500, y: 0 },
                    data: { label: "Database" },
                },
            ],
            edges: [
                {
                    id: "edge-app-server-database",
                    source: "node-app-server",
                    target: "node-database",
                },
            ],
        };

        const result = parseCommand(
            "remove edge Server to Database",
            architecture,
        );

        expect(result.ok).toBe(false);
        if (result.ok) throw new Error("expected an ambiguous-label failure");
        expect(result.message).toContain("multiple nodes");
        expect(architecture.edges).toHaveLength(1);
    });

    test('accepts "link ... to ..." as an alias for connect', () => {
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
            "link Web Server to Database",
            architecture,
        );

        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.architecture.edges[0]).toMatchObject({
            source: "node-web-server",
            target: "node-database",
        });
    });

    test('accepts "connect ... and ..." as an alias for "connect ... to ..."', () => {
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
            "connect Web Server and Database",
            architecture,
        );

        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.architecture.edges[0]).toMatchObject({
            source: "node-web-server",
            target: "node-database",
        });
    });

    test('accepts "delete edge ... to ..." as an alias for remove edge', () => {
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
            "delete edge Web Server to Database",
            architecture,
        );

        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.architecture.edges).toHaveLength(0);
    });

    test('accepts "disconnect ... from ..." as an alias for remove edge', () => {
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
            "disconnect Web Server from Database",
            architecture,
        );

        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.architecture.edges).toHaveLength(0);
    });

    test('accepts "disconnect ... and ..." as an alias for remove edge', () => {
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
            "disconnect Web Server and Database",
            architecture,
        );

        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.architecture.edges).toHaveLength(0);
    });

    test("buildNodeIndex indexes edges by source/target pair for O(1) connectivity lookups", () => {
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

        const nodeIndex = buildNodeIndex(
            architecture.nodes,
            architecture.edges,
        );

        expect(
            nodeIndex.edgesBySourceTarget.get("node-web-server::node-database"),
        ).toBe(architecture.edges[0]);
        expect(
            nodeIndex.edgesBySourceTarget.has("node-database::node-web-server"),
        ).toBe(false);
    });
});

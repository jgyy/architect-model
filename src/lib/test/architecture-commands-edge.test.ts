import { describe, expect, test } from "vitest";

import { parseCommand } from "@/lib/architecture-commands";
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

    test("allows connecting a node to itself, creating a self-loop edge", () => {
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

        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.architecture.edges).toHaveLength(1);
        expect(result.architecture.edges[0]).toMatchObject({
            source: "node-web-server",
            target: "node-web-server",
        });
    });

    test("rejects creating the same self-loop twice", () => {
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
        const first = parseCommand(
            "connect Web Server to Web Server",
            architecture,
        );
        if (!first.ok)
            throw new Error("expected first self-connect to succeed");

        const result = parseCommand(
            "connect Web Server to Web Server",
            first.architecture,
        );

        expect(result.ok).toBe(false);
        if (result.ok)
            throw new Error("expected duplicate self-connect to fail");
        expect(result.message).toBe(
            'An edge from "Web Server" to "Web Server" already exists.',
        );
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
});

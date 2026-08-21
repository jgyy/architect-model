import { describe, expect, test } from "vitest";

import { parseCommand } from "@/lib/architecture-commands";
import type { Architecture } from "@/types/architecture";
import type { SimulationTrace } from "@/types/simulation";

const emptyArchitecture: Architecture = { nodes: [], edges: [] };

describe("parseCommand", () => {
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
        expect(result.message).toBe('Cannot connect "Web Server" to itself.');
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

    test("reports unrecognized commands instead of silently doing nothing, with a hint of supported commands", () => {
        const result = parseCommand("do something weird", emptyArchitecture);

        expect(result.ok).toBe(false);
        if (result.ok)
            throw new Error("expected an unrecognized-command failure");
        expect(result.message).toContain(
            'Unrecognized command: "do something weird"',
        );
        expect(result.message).toContain("add node <label>");
    });

    test("trims whitespace-only input before echoing it back in the error", () => {
        const result = parseCommand("   ", emptyArchitecture);

        expect(result.ok).toBe(false);
        if (result.ok)
            throw new Error("expected an unrecognized-command failure");
        expect(result.message).toContain('Unrecognized command: ""');
    });

    test("reports a missing separator when connect has no recognizable separator", () => {
        const result = parseCommand("connect Web Server", emptyArchitecture);

        expect(result.ok).toBe(false);
        if (result.ok)
            throw new Error("expected a missing-separator failure");
        expect(result.message).toContain("separator");
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

        const result = parseCommand(
            "insert step 2 Cache",
            architecture,
            trace,
        );

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

        const result = parseCommand(
            "insert step 1 Cache",
            architecture,
            trace,
        );

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

        const result = parseCommand(
            "insert step 2 Cache",
            architecture,
            trace,
        );

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

        const result = parseCommand(
            "insert step 4 Cache",
            architecture,
            trace,
        );

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

        const result = parseCommand(
            "insert step 1 Server",
            architecture,
            [],
        );

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

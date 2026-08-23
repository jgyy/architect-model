import { describe, expect, test } from "vitest";

import {
    buildConnectGraph,
    connectableSourceIds,
    connectableTargetIds,
    connectOptionKey,
    decodeConnectOptionKey,
    mergeImportedArchitecture,
    mergeSelectedArchitecture,
    parseImportedArchitecture,
    serializeArchitecture,
} from "@/lib/architecture-io";
import type { Architecture } from "@/types/architecture";

function node(id: string, label: string): Architecture["nodes"][number] {
    return { id, position: { x: 0, y: 0 }, data: { label } };
}

function edge(source: string, target: string): Architecture["edges"][number] {
    return { id: `edge-${source}-${target}`, source, target };
}

const chain: Architecture = {
    nodes: [node("a", "Internet"), node("b", "Web Server"), node("c", "DB")],
    edges: [edge("a", "b"), edge("b", "c")],
};

describe("serializeArchitecture", () => {
    test("round-trips through JSON.parse back to an equivalent architecture", () => {
        const json = serializeArchitecture(chain);

        expect(JSON.parse(json)).toEqual({
            nodes: chain.nodes,
            edges: chain.edges,
        });
    });

    test("pretty-prints with two-space indentation", () => {
        const json = serializeArchitecture(chain);

        expect(json).toContain('\n  "nodes"');
    });
});

describe("parseImportedArchitecture", () => {
    test("accepts a well-formed architecture and counts its nodes/edges", () => {
        const result = parseImportedArchitecture(serializeArchitecture(chain));

        expect(result).toEqual({
            ok: true,
            architecture: { nodes: chain.nodes, edges: chain.edges },
            nodeCount: 3,
            edgeCount: 2,
        });
    });

    test("accepts an empty architecture", () => {
        const result = parseImportedArchitecture(
            serializeArchitecture({ nodes: [], edges: [] }),
        );

        expect(result).toEqual({
            ok: true,
            architecture: { nodes: [], edges: [] },
            nodeCount: 0,
            edgeCount: 0,
        });
    });

    test("rejects text that isn't valid JSON", () => {
        const result = parseImportedArchitecture("not json at all {");

        expect(result).toEqual({
            ok: false,
            message: "That file isn't valid JSON.",
        });
    });

    test.each([
        ["a bare array", "[]"],
        ["missing edges", JSON.stringify({ nodes: [] })],
        [
            "a node without a label",
            JSON.stringify({
                nodes: [{ id: "a", position: { x: 0, y: 0 }, data: {} }],
                edges: [],
            }),
        ],
        [
            "an edge without a source",
            JSON.stringify({ nodes: [], edges: [{ id: "e", target: "a" }] }),
        ],
    ])("rejects %s as the wrong shape", (_description, raw) => {
        const result = parseImportedArchitecture(raw);

        expect(result.ok).toBe(false);
        if (!result.ok) {
            expect(result.message).toMatch(/expected format/);
        }
    });

    test("rejects two nodes sharing the same id", () => {
        const architecture: Architecture = {
            nodes: [node("a", "Internet"), node("a", "Duplicate")],
            edges: [],
        };

        const result = parseImportedArchitecture(
            serializeArchitecture(architecture),
        );

        expect(result).toEqual({
            ok: false,
            message: 'Two nodes share the id "a".',
        });
    });

    test("rejects an edge that references a node that doesn't exist", () => {
        const architecture: Architecture = {
            nodes: [node("a", "Internet")],
            edges: [edge("a", "missing")],
        };

        const result = parseImportedArchitecture(
            serializeArchitecture(architecture),
        );

        expect(result).toEqual({
            ok: false,
            message:
                'Edge "edge-a-missing" references a node that doesn\'t exist.',
        });
    });

    test("rejects a node with more than one outgoing edge", () => {
        const architecture: Architecture = {
            nodes: [node("a", "Internet"), node("b", "Web"), node("c", "DB")],
            edges: [edge("a", "b"), edge("a", "c")],
        };

        const result = parseImportedArchitecture(
            serializeArchitecture(architecture),
        );

        expect(result).toEqual({
            ok: false,
            message: 'More than one edge starts from node "a".',
        });
    });

    test("rejects a node with more than one incoming edge", () => {
        const architecture: Architecture = {
            nodes: [node("a", "Internet"), node("b", "Web"), node("c", "DB")],
            edges: [edge("a", "c"), edge("b", "c")],
        };

        const result = parseImportedArchitecture(
            serializeArchitecture(architecture),
        );

        expect(result).toEqual({
            ok: false,
            message: 'More than one edge points to node "c".',
        });
    });

    test("rejects a cycle among otherwise-valid nodes", () => {
        const architecture: Architecture = {
            nodes: [node("a", "Internet"), node("b", "Web"), node("c", "DB")],
            edges: [edge("a", "b"), edge("b", "c"), edge("c", "a")],
        };

        const result = parseImportedArchitecture(
            serializeArchitecture(architecture),
        );

        expect(result.ok).toBe(false);
        if (!result.ok) {
            expect(result.message).toMatch(/form a loop through node "[abc]"/);
        }
    });

    test("rejects a self-loop as a one-node cycle", () => {
        const architecture: Architecture = {
            nodes: [node("a", "Internet")],
            edges: [edge("a", "a")],
        };

        const result = parseImportedArchitecture(
            serializeArchitecture(architecture),
        );

        expect(result).toEqual({
            ok: false,
            message: 'The edges form a loop through node "a".',
        });
    });

    test("accepts several disjoint chains in one architecture", () => {
        const architecture: Architecture = {
            nodes: [
                node("a", "Internet"),
                node("b", "Web"),
                node("x", "Isolated"),
            ],
            edges: [edge("a", "b")],
        };

        const result = parseImportedArchitecture(
            serializeArchitecture(architecture),
        );

        expect(result).toEqual({
            ok: true,
            architecture,
            nodeCount: 3,
            edgeCount: 1,
        });
    });
});

describe("mergeImportedArchitecture", () => {
    test("appends a disjoint architecture's nodes/edges, counting only the incoming file", () => {
        const incoming: Architecture = {
            nodes: [node("x", "Isolated One"), node("y", "Isolated Two")],
            edges: [edge("x", "y")],
        };

        const result = mergeImportedArchitecture(
            chain,
            serializeArchitecture(incoming),
        );

        expect(result).toEqual({
            ok: true,
            architecture: {
                nodes: [...chain.nodes, ...incoming.nodes],
                edges: [...chain.edges, ...incoming.edges],
            },
            nodeCount: 2,
            edgeCount: 1,
            renamedLabels: [],
        });
    });

    test("assigns a fresh id when an incoming node's id collides with an existing node", () => {
        const incoming: Architecture = {
            nodes: [node("a", "Cache")],
            edges: [],
        };

        const result = mergeImportedArchitecture(
            chain,
            serializeArchitecture(incoming),
        );

        expect(result.ok).toBe(true);
        if (result.ok) {
            const mergedNode = result.architecture.nodes.at(-1);
            expect(mergedNode?.id).toBe("node-cache");
            expect(mergedNode?.data.label).toBe("Cache");
            expect(result.renamedLabels).toEqual([]);
        }
    });

    test("assigns distinct fresh ids when two incoming nodes each collide with an existing id", () => {
        const incoming: Architecture = {
            nodes: [node("a", "First"), node("b", "Second")],
            edges: [],
        };

        const result = mergeImportedArchitecture(
            chain,
            serializeArchitecture(incoming),
        );

        expect(result.ok).toBe(true);
        if (result.ok) {
            const [first, second] = result.architecture.nodes.slice(-2);
            expect(first.id).toBe("node-first");
            expect(second.id).toBe("node-second");
        }
    });

    test("renames an incoming node's label, case-insensitively, when it matches an existing label", () => {
        const incoming: Architecture = {
            nodes: [node("z", "db")],
            edges: [],
        };

        const result = mergeImportedArchitecture(
            chain,
            serializeArchitecture(incoming),
        );

        expect(result.ok).toBe(true);
        if (result.ok) {
            const mergedNode = result.architecture.nodes.at(-1);
            expect(mergedNode?.id).toBe("z");
            expect(mergedNode?.data.label).toBe("db (2)");
            expect(result.renamedLabels).toEqual(['"db" renamed to "db (2)"']);
        }
    });

    test("cascades the label suffix when the first candidate is also taken", () => {
        const current: Architecture = {
            nodes: [node("a", "Cache"), node("b", "Cache (2)")],
            edges: [],
        };
        const incoming: Architecture = {
            nodes: [node("z", "Cache")],
            edges: [],
        };

        const result = mergeImportedArchitecture(
            current,
            serializeArchitecture(incoming),
        );

        expect(result.ok).toBe(true);
        if (result.ok) {
            expect(result.architecture.nodes.at(-1)?.data.label).toBe(
                "Cache (3)",
            );
        }
    });

    test("rewrites an incoming edge's source/target/id to match a remapped node id", () => {
        const incoming: Architecture = {
            nodes: [node("a", "NewNode"), node("y", "Other")],
            edges: [edge("a", "y")],
        };

        const result = mergeImportedArchitecture(
            chain,
            serializeArchitecture(incoming),
        );

        expect(result.ok).toBe(true);
        if (result.ok) {
            const mergedEdge = result.architecture.edges.at(-1);
            expect(mergedEdge).toEqual({
                id: "edge-node-newnode-y",
                source: "node-newnode",
                target: "y",
            });
        }
    });

    test("rejects a malformed incoming file without mutating the current architecture", () => {
        const result = mergeImportedArchitecture(chain, "not json at all {");

        expect(result).toEqual({
            ok: false,
            message: "That file isn't valid JSON.",
        });
    });
});

describe("mergeSelectedArchitecture", () => {
    test("merges only the selected nodes, dropping the rest", () => {
        const incoming: Architecture = {
            nodes: [node("x", "Isolated One"), node("y", "Isolated Two")],
            edges: [],
        };

        const result = mergeSelectedArchitecture(
            chain,
            incoming,
            new Set(["x"]),
        );

        expect(result).toEqual({
            ok: true,
            architecture: {
                nodes: [...chain.nodes, node("x", "Isolated One")],
                edges: chain.edges,
            },
            nodeCount: 1,
            edgeCount: 0,
            renamedLabels: [],
        });
    });

    test("drops an edge when either endpoint isn't selected", () => {
        const incoming: Architecture = {
            nodes: [node("x", "One"), node("y", "Two"), node("z", "Three")],
            edges: [edge("x", "y"), edge("y", "z")],
        };

        const result = mergeSelectedArchitecture(
            chain,
            incoming,
            new Set(["x", "y"]),
        );

        expect(result.ok).toBe(true);
        if (result.ok) {
            expect(result.architecture.edges).toEqual([
                ...chain.edges,
                edge("x", "y"),
            ]);
            expect(result.edgeCount).toBe(1);
        }
    });

    test("keeps an edge when both endpoints are selected", () => {
        const incoming: Architecture = {
            nodes: [node("x", "One"), node("y", "Two")],
            edges: [edge("x", "y")],
        };

        const result = mergeSelectedArchitecture(
            chain,
            incoming,
            new Set(["x", "y"]),
        );

        expect(result.ok).toBe(true);
        if (result.ok) {
            expect(result.architecture.edges).toEqual([
                ...chain.edges,
                edge("x", "y"),
            ]);
            expect(result.edgeCount).toBe(1);
        }
    });

    test("still remaps a colliding id/label within the selected subset", () => {
        const incoming: Architecture = {
            nodes: [node("a", "Cache"), node("z", "Other")],
            edges: [],
        };

        const result = mergeSelectedArchitecture(
            chain,
            incoming,
            new Set(["a"]),
        );

        expect(result.ok).toBe(true);
        if (result.ok) {
            const mergedNode = result.architecture.nodes.at(-1);
            expect(mergedNode?.id).toBe("node-cache");
            expect(mergedNode?.data.label).toBe("Cache");
            expect(result.architecture.nodes).toHaveLength(
                chain.nodes.length + 1,
            );
        }
    });

    test("drops an explicitly excluded edge even when both endpoints are selected", () => {
        const incoming: Architecture = {
            nodes: [node("x", "One"), node("y", "Two")],
            edges: [edge("x", "y")],
        };

        const result = mergeSelectedArchitecture(
            chain,
            incoming,
            new Set(["x", "y"]),
            new Set(["edge-x-y"]),
        );

        expect(result.ok).toBe(true);
        if (result.ok) {
            expect(result.architecture.edges).toEqual(chain.edges);
            expect(result.edgeCount).toBe(0);
        }
    });

    test("selecting no nodes merges nothing", () => {
        const incoming: Architecture = {
            nodes: [node("x", "Isolated")],
            edges: [],
        };

        const result = mergeSelectedArchitecture(chain, incoming, new Set());

        expect(result).toEqual({
            ok: true,
            architecture: { nodes: chain.nodes, edges: chain.edges },
            nodeCount: 0,
            edgeCount: 0,
            renamedLabels: [],
        });
    });

    test("folds addedEdges into the merged result, remapping ids and counting them", () => {
        const incoming: Architecture = {
            nodes: [node("a", "Cache"), node("y", "Other")],
            edges: [],
        };

        const result = mergeSelectedArchitecture(
            chain,
            incoming,
            new Set(["a", "y"]),
            new Set(),
            [
                {
                    source: connectOptionKey("incoming", "a"),
                    target: connectOptionKey("incoming", "y"),
                },
            ],
        );

        expect(result.ok).toBe(true);
        if (result.ok) {
            expect(result.architecture.edges).toEqual([
                ...chain.edges,
                { id: "edge-node-cache-y", source: "node-cache", target: "y" },
            ]);
            expect(result.edgeCount).toBe(1);
        }
    });

    test("resolves a manual edge's \"current\" endpoint literally, even when an incoming node's original id collides with it", () => {
        // chain's "c" (DB) has no outgoing edge yet; the incoming file
        // separately has its own node whose original id is also "c" - it
        // collides and gets remapped to "node-cache" during the merge.
        const incoming: Architecture = {
            nodes: [node("c", "Cache")],
            edges: [],
        };

        const result = mergeSelectedArchitecture(
            chain,
            incoming,
            new Set(["c"]),
            new Set(),
            [
                {
                    source: connectOptionKey("current", "c"),
                    target: connectOptionKey("incoming", "c"),
                },
            ],
        );

        expect(result.ok).toBe(true);
        if (result.ok) {
            const addedEdge = result.architecture.edges.at(-1);
            expect(addedEdge).toEqual({
                id: "edge-c-node-cache",
                source: "c",
                target: "node-cache",
            });
        }
    });

    test("defaults to no added edges when the argument is omitted", () => {
        const incoming: Architecture = {
            nodes: [node("x", "One"), node("y", "Two")],
            edges: [],
        };

        const result = mergeSelectedArchitecture(
            chain,
            incoming,
            new Set(["x", "y"]),
        );

        expect(result.ok).toBe(true);
        if (result.ok) {
            expect(result.architecture.edges).toEqual(chain.edges);
            expect(result.edgeCount).toBe(0);
        }
    });
});

describe("connectableSourceIds", () => {
    test("returns every node id when there are no edges yet", () => {
        const ids = connectableSourceIds([node("a", "A"), node("b", "B")], []);

        expect(ids).toEqual(new Set(["a", "b"]));
    });

    test("excludes a node that already has an outgoing edge", () => {
        const ids = connectableSourceIds(
            [node("a", "A"), node("b", "B"), node("c", "C")],
            [edge("a", "b")],
        );

        expect(ids).toEqual(new Set(["b", "c"]));
    });
});

describe("connectableTargetIds", () => {
    test("excludes the source itself", () => {
        const ids = connectableTargetIds(
            "a",
            [node("a", "A"), node("b", "B")],
            [],
        );

        expect(ids).toEqual(new Set(["b"]));
    });

    test("excludes a node that already has an incoming edge", () => {
        const ids = connectableTargetIds(
            "a",
            [node("a", "A"), node("b", "B"), node("c", "C")],
            [edge("b", "c")],
        );

        expect(ids).toEqual(new Set(["b"]));
    });

    test("excludes a node that would close a cycle back to the source", () => {
        const ids = connectableTargetIds(
            "c",
            [node("a", "A"), node("b", "B"), node("c", "C")],
            [edge("a", "b"), edge("b", "c")],
        );

        expect(ids).toEqual(new Set());
    });

    test("allows connecting to a node on a disjoint chain", () => {
        const ids = connectableTargetIds(
            "b",
            [node("a", "A"), node("b", "B"), node("x", "X"), node("y", "Y")],
            [edge("a", "b"), edge("x", "y")],
        );

        expect(ids).toEqual(new Set(["x"]));
    });
});

describe("connectOptionKey / decodeConnectOptionKey", () => {
    test("round-trips the origin and raw id", () => {
        expect(
            decodeConnectOptionKey(connectOptionKey("current", "a")),
        ).toEqual({ origin: "current", id: "a" });
        expect(
            decodeConnectOptionKey(connectOptionKey("incoming", "node-cache")),
        ).toEqual({ origin: "incoming", id: "node-cache" });
    });
});

describe("buildConnectGraph", () => {
    test("namespaces current and incoming node/edge ids by origin", () => {
        const current: Architecture = {
            nodes: [node("a", "Internet"), node("b", "Web Server")],
            edges: [edge("a", "b")],
        };
        const incomingNodes = [node("x", "Cache")];
        const incomingEdges: Architecture["edges"] = [];

        const graph = buildConnectGraph(current, incomingNodes, incomingEdges);

        expect(graph.nodes.map((n) => n.id)).toEqual([
            "current:a",
            "current:b",
            "incoming:x",
        ]);
        expect(graph.edges).toEqual([
            { id: "edge-a-b", source: "current:a", target: "current:b" },
        ]);
    });

    test("keeps a current node and a colliding incoming node distinct for connectability", () => {
        const current: Architecture = {
            nodes: [node("a", "Internet"), node("b", "Web Server")],
            edges: [edge("a", "b")],
        };
        // Same raw id "a" as current's Internet node
        const incomingNodes = [node("a", "Cache")];

        const graph = buildConnectGraph(current, incomingNodes, []);
        const sourceIds = connectableSourceIds(graph.nodes, graph.edges);

        expect(sourceIds).toEqual(new Set(["current:b", "incoming:a"]));
    });
});

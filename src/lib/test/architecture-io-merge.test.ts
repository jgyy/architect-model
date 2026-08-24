import { describe, expect, test } from "vitest";

import {
    connectOptionKey,
    mergeSelectedArchitecture,
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

describe("mergeSelectedArchitecture", () => {
    test("merges only the selected nodes, dropping the rest, appended after the last step", () => {
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
                nodes: [
                    ...chain.nodes,
                    {
                        ...node("x", "Isolated One"),
                        position: { x: 750, y: 0 },
                    },
                ],
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
        // chain's "c" (DB) has no outgoing edge yet;
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

    test("insertAtStep splices the incoming block before an existing step, shifting everything after it", () => {
        const incoming: Architecture = {
            nodes: [node("x", "New")],
            edges: [],
        };

        const result = mergeSelectedArchitecture(
            chain,
            incoming,
            new Set(["x"]),
            new Set(),
            [],
            1,
        );

        expect(result.ok).toBe(true);
        if (result.ok) {
            expect(result.architecture.nodes).toEqual([
                chain.nodes[0],
                { ...node("x", "New"), position: { x: 250, y: 0 } },
                { ...chain.nodes[1], position: { x: 500, y: 0 } },
                { ...chain.nodes[2], position: { x: 750, y: 0 } },
            ]);
        }
    });

    test("insertAtStep of 0 places the incoming block before every existing node", () => {
        const incoming: Architecture = {
            nodes: [node("x", "New")],
            edges: [],
        };

        const result = mergeSelectedArchitecture(
            chain,
            incoming,
            new Set(["x"]),
            new Set(),
            [],
            0,
        );

        expect(result.ok).toBe(true);
        if (result.ok) {
            expect(result.architecture.nodes).toEqual([
                { ...node("x", "New"), position: { x: 0, y: 0 } },
                { ...chain.nodes[0], position: { x: 250, y: 0 } },
                { ...chain.nodes[1], position: { x: 500, y: 0 } },
                { ...chain.nodes[2], position: { x: 750, y: 0 } },
            ]);
        }
    });

    test("leaves nodes before the insertion point at their existing (possibly hand-dragged) position", () => {
        const draggedChain: Architecture = {
            nodes: [
                { ...node("a", "Internet"), position: { x: 42, y: 17 } },
                node("b", "Web Server"),
                node("c", "DB"),
            ],
            edges: chain.edges,
        };
        const incoming: Architecture = {
            nodes: [node("x", "New")],
            edges: [],
        };

        const result = mergeSelectedArchitecture(
            draggedChain,
            incoming,
            new Set(["x"]),
            new Set(),
            [],
            1,
        );

        expect(result.ok).toBe(true);
        if (result.ok) {
            expect(result.architecture.nodes[0].position).toEqual({
                x: 42,
                y: 17,
            });
        }
    });

    test("defaults insertAtStep to appending after the current last step", () => {
        const incoming: Architecture = {
            nodes: [node("x", "New")],
            edges: [],
        };

        const withDefault = mergeSelectedArchitecture(
            chain,
            incoming,
            new Set(["x"]),
        );
        const withExplicitLength = mergeSelectedArchitecture(
            chain,
            incoming,
            new Set(["x"]),
            new Set(),
            [],
            chain.nodes.length,
        );

        expect(withDefault).toEqual(withExplicitLength);
    });
});

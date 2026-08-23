import { describe, expect, test } from "vitest";

import {
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

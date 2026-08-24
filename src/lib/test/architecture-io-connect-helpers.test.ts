import { describe, expect, test } from "vitest";

import {
    buildConnectGraph,
    connectableSourceIds,
    connectableTargetIds,
    connectOptionKey,
    decodeConnectOptionKey,
} from "@/lib/architecture-io";
import type { Architecture } from "@/types/architecture";

function node(id: string, label: string): Architecture["nodes"][number] {
    return { id, position: { x: 0, y: 0 }, data: { label } };
}

function edge(source: string, target: string): Architecture["edges"][number] {
    return { id: `edge-${source}-${target}`, source, target };
}

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

    test("round-trips a raw id that itself contains colons", () => {
        expect(
            decodeConnectOptionKey(
                connectOptionKey("incoming", "node:with:colons"),
            ),
        ).toEqual({ origin: "incoming", id: "node:with:colons" });
    });

    test("resolves origin correctly even when the raw id starts with the other origin's name", () => {
        expect(
            decodeConnectOptionKey(
                connectOptionKey("incoming", "current:looks-like-current"),
            ),
        ).toEqual({ origin: "incoming", id: "current:looks-like-current" });
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

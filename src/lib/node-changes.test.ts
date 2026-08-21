import { describe, expect, test } from "vitest";
import type { Connection, NodeChange } from "@xyflow/react";

import {
    applyPersistableNodeChanges,
    createEdgeFromConnection,
} from "@/lib/node-changes";
import type { Architecture, ArchitectureNode } from "@/types/architecture";

const nodes: ArchitectureNode[] = [
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
];

describe("applyPersistableNodeChanges", () => {
    test("applies a position change to the matching node", () => {
        const changes: NodeChange<ArchitectureNode>[] = [
            {
                type: "position",
                id: "node-web-server",
                position: { x: 40, y: 60 },
            },
        ];
        const result = applyPersistableNodeChanges(changes, nodes);
        expect(
            result.find((n) => n.id === "node-web-server")?.position,
        ).toEqual({
            x: 40,
            y: 60,
        });
        expect(result.find((n) => n.id === "node-database")?.position).toEqual({
            x: 250,
            y: 0,
        });
    });

    test("drops a remove change instead of deleting the node", () => {
        const changes: NodeChange<ArchitectureNode>[] = [
            { type: "remove", id: "node-web-server" },
        ];
        const result = applyPersistableNodeChanges(changes, nodes);
        expect(result.map((n) => n.id)).toEqual([
            "node-web-server",
            "node-database",
        ]);
    });

    test("drops a select change rather than persisting selection state", () => {
        const changes: NodeChange<ArchitectureNode>[] = [
            { type: "select", id: "node-web-server", selected: true },
        ];
        const result = applyPersistableNodeChanges(changes, nodes);
        expect(
            result.find((n) => n.id === "node-web-server")?.selected,
        ).toBeUndefined();
    });

    test("leaves nodes untouched when there are no changes", () => {
        expect(applyPersistableNodeChanges([], nodes)).toEqual(nodes);
    });
});

function connection(source: string, target: string): Connection {
    return { source, target, sourceHandle: null, targetHandle: null };
}

describe("createEdgeFromConnection", () => {
    const architecture: Architecture = {
        nodes,
        edges: [
            {
                id: "edge-node-web-server-node-database",
                source: "node-web-server",
                target: "node-database",
            },
        ],
    };

    test("builds an edge from a valid connection", () => {
        const edge = createEdgeFromConnection(
            connection("node-database", "node-web-server"),
            architecture,
        );
        expect(edge).toEqual({
            id: "edge-node-database-node-web-server",
            source: "node-database",
            target: "node-web-server",
        });
    });

    test("rejects a self-loop", () => {
        const edge = createEdgeFromConnection(
            connection("node-web-server", "node-web-server"),
            architecture,
        );
        expect(edge).toBeNull();
    });

    test("rejects a connection duplicating an existing edge", () => {
        const edge = createEdgeFromConnection(
            connection("node-web-server", "node-database"),
            architecture,
        );
        expect(edge).toBeNull();
    });

    test("rejects a connection missing a source or target", () => {
        expect(
            createEdgeFromConnection(
                connection("", "node-web-server"),
                architecture,
            ),
        ).toBeNull();
        expect(
            createEdgeFromConnection(
                connection("node-web-server", ""),
                architecture,
            ),
        ).toBeNull();
    });
});

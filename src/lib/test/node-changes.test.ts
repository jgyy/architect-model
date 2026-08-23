import { describe, expect, test } from "vitest";
import type { NodeChange } from "@xyflow/react";

import { applyPersistableNodeChanges } from "@/lib/node-changes";
import type { ArchitectureNode } from "@/types/architecture";

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

    test("drops an in-progress drag tick (dragging: true) instead of persisting every pointer move", () => {
        const changes: NodeChange<ArchitectureNode>[] = [
            {
                type: "position",
                id: "node-web-server",
                position: { x: 40, y: 60 },
                dragging: true,
            },
        ];
        expect(applyPersistableNodeChanges(changes, nodes)).toBe(nodes);
    });

    test("applies the final position once dragging settles (dragging: false)", () => {
        const changes: NodeChange<ArchitectureNode>[] = [
            {
                type: "position",
                id: "node-web-server",
                position: { x: 40, y: 60 },
                dragging: false,
            },
        ];
        const result = applyPersistableNodeChanges(changes, nodes);
        expect(
            result.find((n) => n.id === "node-web-server")?.position,
        ).toEqual({ x: 40, y: 60 });
    });

    test("in a mixed batch, applies only the settled change and ignores in-progress ones", () => {
        const changes: NodeChange<ArchitectureNode>[] = [
            {
                type: "position",
                id: "node-web-server",
                position: { x: 10, y: 10 },
                dragging: true,
            },
            {
                type: "position",
                id: "node-web-server",
                position: { x: 20, y: 20 },
                dragging: true,
            },
            {
                type: "position",
                id: "node-web-server",
                position: { x: 30, y: 30 },
                dragging: false,
            },
        ];
        const result = applyPersistableNodeChanges(changes, nodes);
        expect(
            result.find((n) => n.id === "node-web-server")?.position,
        ).toEqual({ x: 30, y: 30 });
    });
});

import { describe, expect, test } from "vitest";

import { buildRemoveEdgeCommand } from "@/lib/edge-delete";
import type { Architecture } from "@/types/architecture";

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

describe("buildRemoveEdgeCommand", () => {
    test("builds a 'remove edge A to B' command from the edge's endpoint labels", () => {
        expect(
            buildRemoveEdgeCommand("edge-web-server-database", architecture),
        ).toBe("remove edge Web Server to Database");
    });

    test("returns null when the edge id doesn't exist", () => {
        expect(buildRemoveEdgeCommand("missing-edge", architecture)).toBeNull();
    });

    test("returns null when an endpoint node no longer exists", () => {
        const dangling: Architecture = {
            nodes: [architecture.nodes[0]],
            edges: architecture.edges,
        };
        expect(
            buildRemoveEdgeCommand("edge-web-server-database", dangling),
        ).toBeNull();
    });
});

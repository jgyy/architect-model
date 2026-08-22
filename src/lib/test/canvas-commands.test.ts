import { describe, expect, test } from "vitest";

import {
    buildConnectCommand,
    buildMoveNodeCommand,
    buildRemoveEdgeCommand,
    buildRemoveNodeCommand,
    buildRenameNodeCommand,
    isDoubleClick,
    nextDefaultNodeLabel,
} from "@/lib/canvas-commands";
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

describe("buildConnectCommand", () => {
    test("builds a 'connect A to B' command from the two node ids' labels", () => {
        expect(
            buildConnectCommand(
                "node-web-server",
                "node-database",
                architecture,
            ),
        ).toBe("connect Web Server to Database");
    });

    test("builds a self-loop command when source and target are the same node", () => {
        expect(
            buildConnectCommand(
                "node-web-server",
                "node-web-server",
                architecture,
            ),
        ).toBe("connect Web Server to Web Server");
    });

    test("returns null when the source id doesn't exist", () => {
        expect(
            buildConnectCommand("missing", "node-database", architecture),
        ).toBeNull();
    });

    test("returns null when the target id doesn't exist", () => {
        expect(
            buildConnectCommand("node-web-server", "missing", architecture),
        ).toBeNull();
    });
});

describe("buildRenameNodeCommand", () => {
    test("builds a 'rename node A to B' command from the node's current label", () => {
        expect(
            buildRenameNodeCommand("node-web-server", "Frontend", architecture),
        ).toBe("rename node Web Server to Frontend");
    });

    test("returns null when the node id doesn't exist", () => {
        expect(
            buildRenameNodeCommand("missing", "Frontend", architecture),
        ).toBeNull();
    });
});

describe("buildRemoveNodeCommand", () => {
    test("builds a 'remove node A' command from the node's label", () => {
        expect(buildRemoveNodeCommand("node-web-server", architecture)).toBe(
            "remove node Web Server",
        );
    });

    test("returns null when the node id doesn't exist", () => {
        expect(buildRemoveNodeCommand("missing", architecture)).toBeNull();
    });
});

describe("buildMoveNodeCommand", () => {
    test("builds a 'move node A to step N' command from the node's label and target position", () => {
        expect(buildMoveNodeCommand("node-database", 1, architecture)).toBe(
            "move node Database to step 1",
        );
    });

    test("returns null when the node id doesn't exist", () => {
        expect(buildMoveNodeCommand("missing", 1, architecture)).toBeNull();
    });
});

describe("nextDefaultNodeLabel", () => {
    test('returns "Node 1" for an empty architecture', () => {
        expect(nextDefaultNodeLabel({ nodes: [], edges: [] })).toBe("Node 1");
    });

    test("returns the next unused number based on node count", () => {
        expect(nextDefaultNodeLabel(architecture)).toBe("Node 3");
    });

    test("skips a number already used as a label, case-insensitively", () => {
        const withNodeThree: Architecture = {
            nodes: [
                ...architecture.nodes,
                {
                    id: "node-node-3",
                    position: { x: 0, y: 0 },
                    data: { label: "node 3" },
                },
            ],
            edges: [],
        };
        expect(nextDefaultNodeLabel(withNodeThree)).toBe("Node 4");
    });
});

describe("isDoubleClick", () => {
    test("is false when there is no previous click", () => {
        expect(isDoubleClick({ x: 10, y: 10, time: 1000 }, null)).toBe(false);
    });

    test("is true when the second click is close in time and position", () => {
        const previous = { x: 10, y: 10, time: 1000 };
        const current = { x: 12, y: 8, time: 1250 };
        expect(isDoubleClick(current, previous)).toBe(true);
    });

    test("is false when the second click is too slow", () => {
        const previous = { x: 10, y: 10, time: 1000 };
        const current = { x: 10, y: 10, time: 2000 };
        expect(isDoubleClick(current, previous)).toBe(false);
    });

    test("is false when the second click is too far away", () => {
        const previous = { x: 10, y: 10, time: 1000 };
        const current = { x: 200, y: 10, time: 1100 };
        expect(isDoubleClick(current, previous)).toBe(false);
    });
});

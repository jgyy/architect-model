import { describe, expect, test } from "vitest";

import { parseCommand } from "@/lib/architecture-commands";
import type { Architecture } from "@/types/architecture";

const emptyArchitecture: Architecture = { nodes: [], edges: [] };

describe("parseCommand - simulation steps embedded in nodes", () => {
    test("adding a node auto-generates its simulation step description", () => {
        const result = parseCommand("add node Web Server", emptyArchitecture);

        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.architecture.nodes).toHaveLength(1);
        expect(result.architecture.nodes[0].data).toEqual({
            label: "Web Server",
            description: 'Reaches "Web Server".',
        });
        expect(result.message).toBe(
            'Added node "Web Server" as simulation step 1.',
        );
    });

    test("each added node appends the next contiguous simulation step, in insertion order", () => {
        const afterFirst = parseCommand(
            "add node Web Server",
            emptyArchitecture,
        );
        if (!afterFirst.ok) throw new Error("expected first add to succeed");

        const result = parseCommand(
            "add node Database",
            afterFirst.architecture,
        );

        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.architecture.nodes.map((n) => n.data.label)).toEqual([
            "Web Server",
            "Database",
        ]);
        expect(result.message).toBe(
            'Added node "Database" as simulation step 2.',
        );
    });

    test("removing a node removes its simulation step along with it", () => {
        const architecture: Architecture = {
            nodes: [
                {
                    id: "node-web-server",
                    position: { x: 0, y: 0 },
                    data: {
                        label: "Web Server",
                        description: 'Reaches "Web Server".',
                    },
                },
                {
                    id: "node-database",
                    position: { x: 250, y: 0 },
                    data: {
                        label: "Database",
                        description: 'Reaches "Database".',
                    },
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
        expect(result.architecture.nodes.map((n) => n.data.label)).toEqual([
            "Database",
        ]);
        expect(result.architecture.edges).toEqual([]);
        expect(result.message).toBe(
            'Removed node "Web Server" and its simulation step.',
        );
    });

    for (const command of [
        "add step Web Server",
        "insert step 2 Web Server",
        "set step 1 description Attacker pivots",
        "remove step 1",
        "move step 1 to 2",
    ]) {
        test(`"${command}" is no longer a recognized command`, () => {
            const result = parseCommand(command, emptyArchitecture);

            expect(result.ok).toBe(false);
            if (result.ok) throw new Error("expected an unrecognized command");
            expect(result.message).toContain("Unrecognized command");
        });
    }
});

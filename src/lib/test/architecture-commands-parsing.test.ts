import { describe, expect, test } from "vitest";

import { parseCommand } from "@/lib/architecture-commands";
import type { Architecture } from "@/types/architecture";

const emptyArchitecture: Architecture = { nodes: [], edges: [] };

describe("parseCommand — command parsing", () => {
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
        if (result.ok) throw new Error("expected a missing-separator failure");
        expect(result.message).toContain("separator");
    });

    test("rejects a connect with a blank source label instead of silently picking an arbitrary node", () => {
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

        // a double space between "connect" and "to" leaves the source blank
        const result = parseCommand("connect  to Database", architecture);

        expect(result.ok).toBe(false);
        if (result.ok) throw new Error("expected a blank-source failure");
        expect(result.message).toBe('No node named "".');
    });
});

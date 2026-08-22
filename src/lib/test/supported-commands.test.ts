import { describe, expect, test } from "vitest";

import { SUPPORTED_COMMANDS } from "@/lib/supported-commands";

describe("SUPPORTED_COMMANDS", () => {
    test("is a non-empty array", () => {
        expect(Array.isArray(SUPPORTED_COMMANDS)).toBe(true);
        expect(SUPPORTED_COMMANDS.length).toBeGreaterThan(0);
    });

    test("every entry is a non-empty string", () => {
        for (const entry of SUPPORTED_COMMANDS) {
            expect(typeof entry).toBe("string");
            expect(entry.trim().length).toBeGreaterThan(0);
        }
    });

    test.each([
        "add node",
        "connect",
        "remove node",
        "remove edge",
        "rename node",
    ])("documents the '%s' command", (keyword) => {
        expect(
            SUPPORTED_COMMANDS.some((entry) => entry.includes(keyword)),
        ).toBe(true);
    });
});

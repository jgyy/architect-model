import { describe, expect, test } from "vitest";

import {
    COMMAND_USAGE,
    HELP_MESSAGE,
    SUPPORTED_COMMANDS,
} from "@/lib/supported-commands";

// The console renders at a fixed 80-column width
const CONSOLE_WIDTH = 80;

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
        "move node <label> to step",
        "undo",
        "redo",
    ])("documents the '%s' command", (keyword) => {
        expect(
            SUPPORTED_COMMANDS.some((entry) => entry.includes(keyword)),
        ).toBe(true);
    });

    test("no line of any entry exceeds the console's 80-column width", () => {
        for (const entry of SUPPORTED_COMMANDS) {
            for (const line of entry.split("\n")) {
                expect(line.length).toBeLessThanOrEqual(CONSOLE_WIDTH);
            }
        }
    });

    test("omits the alias line entirely for a command with no aliases", () => {
        for (const entry of SUPPORTED_COMMANDS) {
            for (const line of entry.split("\n")) {
                expect(line.trim()).not.toMatch(/^alias(es)?:\s*$/);
            }
        }
    });
});

describe("COMMAND_USAGE", () => {
    test("has one plain usage line per documented command", () => {
        expect(COMMAND_USAGE.length).toBe(SUPPORTED_COMMANDS.length);
    });

    test("every usage line fits comfortably inside the console width", () => {
        for (const usage of COMMAND_USAGE) {
            expect(usage.length).toBeLessThanOrEqual(CONSOLE_WIDTH);
        }
    });
});

describe("HELP_MESSAGE", () => {
    test("starts with a heading and includes every command's usage", () => {
        expect(HELP_MESSAGE.startsWith("Commands:")).toBe(true);
        for (const usage of COMMAND_USAGE) {
            expect(HELP_MESSAGE).toContain(usage);
        }
    });

    test("no line exceeds the console's 80-column width", () => {
        for (const line of HELP_MESSAGE.split("\n")) {
            expect(line.length).toBeLessThanOrEqual(CONSOLE_WIDTH);
        }
    });
});

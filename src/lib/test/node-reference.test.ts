import { describe, expect, test } from "vitest";

import {
    CONNECT_PATTERNS,
    CONNECT_SEPARATORS,
    DISCONNECT_SEPARATORS,
    REMOVE_EDGE_PATTERNS,
    REMOVE_NODE_PATTERNS,
    RENAME_NODE_PATTERNS,
    RENAME_SEPARATORS,
    matchFirst,
    normalizeLabel,
} from "@/lib/node-reference";

describe("matchFirst", () => {
    test("returns the first pattern's match when it matches", () => {
        const result = matchFirst(
            [/^(hello)/, /^(hello world)/],
            "hello world",
        );
        expect(result?.[1]).toBe("hello");
    });

    test("falls through to a later pattern when earlier ones don't match", () => {
        const result = matchFirst(REMOVE_NODE_PATTERNS, "delete node Foo");
        expect(result?.[1]).toBe("Foo");
    });

    test("tries patterns in the given order, not the order they'd match longest", () => {
        const patterns = [/^foo(.+)$/, /^foo(.+)y$/];
        const result = matchFirst(patterns, "fooxy");
        expect(result?.[1]).toBe("xy");
    });

    test("returns null when no pattern in the array matches", () => {
        const result = matchFirst([/^a$/, /^b$/], "c");
        expect(result).toBeNull();
    });

    test("returns null for an empty patterns array", () => {
        const result = matchFirst([], "anything");
        expect(result).toBeNull();
    });
});

describe("normalizeLabel", () => {
    test("trims leading and trailing whitespace", () => {
        expect(normalizeLabel("  Hello World  ")).toBe("Hello World");
    });

    test("collapses multiple internal spaces to a single space", () => {
        expect(normalizeLabel("Hello    World")).toBe("Hello World");
    });

    test("collapses internal whitespace runs made of mixed whitespace characters", () => {
        expect(normalizeLabel("Hello\t\t World")).toBe("Hello World");
    });

    test("strips invisible characters mixed into a label", () => {
        // zero-width space, "Hello", zero-width non-joiner, a real space,
        // zero-width joiner, "World", byte-order mark
        const withInvisibles = "​Hello‌ ‍World﻿";
        expect(normalizeLabel(withInvisibles)).toBe("Hello World");
    });

    test("normalizes a base+combining-mark character equal to its precomposed form", () => {
        const decomposed = "Café"; // e + combining acute accent
        const precomposed = "Café"; // precomposed e-with-acute
        expect(normalizeLabel(decomposed)).toBe(normalizeLabel(precomposed));
        expect(normalizeLabel(decomposed)).toBe(precomposed);
    });

    test("is a no-op on an already-normalized label", () => {
        expect(normalizeLabel("Already Normalized")).toBe("Already Normalized");
    });
});

describe("CONNECT_PATTERNS", () => {
    test("matches 'connect X' case-insensitively", () => {
        expect(
            matchFirst(CONNECT_PATTERNS, "CONNECT Web Server"),
        ).not.toBeNull();
    });

    test("matches 'link X' case-insensitively", () => {
        expect(matchFirst(CONNECT_PATTERNS, "Link Web Server")).not.toBeNull();
    });

    test("does not match unrelated text", () => {
        expect(
            matchFirst(CONNECT_PATTERNS, "disconnect Web Server"),
        ).toBeNull();
    });
});

describe("REMOVE_NODE_PATTERNS", () => {
    test("matches 'remove node X'", () => {
        expect(
            matchFirst(REMOVE_NODE_PATTERNS, "remove node Cache"),
        ).not.toBeNull();
    });

    test("matches 'delete node X' case-insensitively", () => {
        expect(
            matchFirst(REMOVE_NODE_PATTERNS, "DELETE NODE Cache"),
        ).not.toBeNull();
    });
});

describe("REMOVE_EDGE_PATTERNS", () => {
    test("matches 'remove edge X'", () => {
        expect(
            matchFirst(REMOVE_EDGE_PATTERNS, "remove edge A to B"),
        ).not.toBeNull();
    });

    test("matches 'delete edge X'", () => {
        expect(
            matchFirst(REMOVE_EDGE_PATTERNS, "delete edge A to B"),
        ).not.toBeNull();
    });

    test("matches 'disconnect X' case-insensitively", () => {
        expect(
            matchFirst(REMOVE_EDGE_PATTERNS, "DISCONNECT A from B"),
        ).not.toBeNull();
    });
});

describe("RENAME_NODE_PATTERNS", () => {
    test("matches 'rename node X'", () => {
        expect(
            matchFirst(RENAME_NODE_PATTERNS, "rename node Cache to Redis"),
        ).not.toBeNull();
    });

    test("matches 'relabel node X' case-insensitively", () => {
        expect(
            matchFirst(RENAME_NODE_PATTERNS, "RELABEL NODE Cache to Redis"),
        ).not.toBeNull();
    });
});

describe("separator constants", () => {
    test("CONNECT_SEPARATORS contains the expected separators", () => {
        expect(CONNECT_SEPARATORS).toEqual([" to ", " and "]);
    });

    test("DISCONNECT_SEPARATORS contains the expected separators", () => {
        expect(DISCONNECT_SEPARATORS).toEqual([" to ", " from ", " and "]);
    });

    test("RENAME_SEPARATORS contains the expected separators", () => {
        expect(RENAME_SEPARATORS).toEqual([" to "]);
    });
});

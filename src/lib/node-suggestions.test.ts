import { describe, expect, test } from "vitest";

import {
    applyNodeSuggestion,
    suggestNodeReference,
} from "@/lib/node-suggestions";
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
        {
            id: "node-cache",
            position: { x: 500, y: 0 },
            data: { label: "Cache" },
        },
    ],
    edges: [],
};

function labels(matches: { data: { label: string } }[]): string[] {
    return matches.map((m) => m.data.label);
}

describe("suggestNodeReference", () => {
    test("returns null for an unrecognized command", () => {
        expect(suggestNodeReference("foo bar", architecture)).toBeNull();
    });

    test("returns null while adding a node, since the label is new rather than a reference", () => {
        expect(suggestNodeReference("add node Ca", architecture)).toBeNull();
    });

    test("suggests matching nodes for a partial 'remove node' label", () => {
        const suggestion = suggestNodeReference("remove node Da", architecture);

        expect(suggestion).not.toBeNull();
        expect(labels(suggestion!.matches)).toEqual(["Database"]);
        expect(suggestion!.replaceFrom).toBe("remove node ".length);
        expect(suggestion!.replaceTo).toBe("remove node Da".length);
    });

    test("suggests every node once the argument is empty", () => {
        const suggestion = suggestNodeReference("remove node  ", architecture);

        expect(suggestion).not.toBeNull();
        expect(labels(suggestion!.matches)).toEqual([
            "Cache",
            "Database",
            "Web Server",
        ]);
    });

    test("matches case-insensitively", () => {
        const suggestion = suggestNodeReference("REMOVE NODE da", architecture);

        expect(labels(suggestion!.matches)).toEqual(["Database"]);
    });

    test("ranks an exact match before a startsWith match before an includes match", () => {
        const withWeb: Architecture = {
            nodes: [
                ...architecture.nodes,
                { id: "node-web", position: { x: 0, y: 0 }, data: { label: "Web" } },
            ],
            edges: [],
        };

        const suggestion = suggestNodeReference("remove node Web", withWeb);

        expect(labels(suggestion!.matches)).toEqual(["Web", "Web Server"]);
    });

    test("suggests the source node while typing the first argument of 'connect'", () => {
        const suggestion = suggestNodeReference("connect Web Ser", architecture);

        expect(labels(suggestion!.matches)).toEqual(["Web Server"]);
        expect(suggestion!.replaceFrom).toBe("connect ".length);
        expect(suggestion!.replaceTo).toBe("connect Web Ser".length);
    });

    test("suggests the target node after the separator in 'connect A to B'", () => {
        const input = "connect Web Server to Da";
        const suggestion = suggestNodeReference(input, architecture);

        expect(labels(suggestion!.matches)).toEqual(["Database"]);
        expect(suggestion!.replaceFrom).toBe(input.indexOf("Da"));
        expect(suggestion!.replaceTo).toBe(input.length);
    });

    test("suggests the target node after the separator in 'remove edge A from B'", () => {
        const input = "remove edge Web Server from Da";
        const suggestion = suggestNodeReference(input, architecture);

        expect(labels(suggestion!.matches)).toEqual(["Database"]);
        expect(suggestion!.replaceFrom).toBe(input.indexOf("Da"));
    });

    test("targets the first argument of 'connect' when the cursor is still inside it", () => {
        const input = "connect Web Server to Cache";
        const cursor = input.indexOf("Web");
        const suggestion = suggestNodeReference(input, architecture, cursor);

        expect(labels(suggestion!.matches)).toEqual(["Web Server"]);
        expect(suggestion!.replaceFrom).toBe("connect ".length);
        expect(suggestion!.replaceTo).toBe(input.indexOf(" to "));
    });

    test("targets the first argument of 'remove edge' when the cursor is still inside it", () => {
        const input = "remove edge Web Server from Cache";
        const cursor = input.indexOf("Web");
        const suggestion = suggestNodeReference(input, architecture, cursor);

        expect(labels(suggestion!.matches)).toEqual(["Web Server"]);
        expect(suggestion!.replaceFrom).toBe("remove edge ".length);
        expect(suggestion!.replaceTo).toBe(input.indexOf(" from "));
    });

    test("treats the cursor sitting right at the separator as still editing the first argument", () => {
        const input = "connect Web Server to Cache";
        const cursor = input.indexOf(" to ");
        const suggestion = suggestNodeReference(input, architecture, cursor);

        expect(labels(suggestion!.matches)).toEqual(["Web Server"]);
        expect(suggestion!.replaceTo).toBe(cursor);
    });

    test("still targets the second argument once the cursor is past the separator", () => {
        const input = "connect Web Server to Cache";
        const cursor = input.indexOf("Cache") + 1;
        const suggestion = suggestNodeReference(input, architecture, cursor);

        expect(labels(suggestion!.matches)).toEqual(["Cache"]);
        expect(suggestion!.replaceFrom).toBe(input.indexOf("Cache"));
        expect(suggestion!.replaceTo).toBe(input.length);
    });

    test("suggests matching nodes for a partial 'add step' label", () => {
        const suggestion = suggestNodeReference("add step Cac", architecture);

        expect(labels(suggestion!.matches)).toEqual(["Cache"]);
    });

    test("suggests every node right after 'add step' with no argument typed yet", () => {
        const suggestion = suggestNodeReference("add step", architecture);

        expect(suggestion).not.toBeNull();
        expect(labels(suggestion!.matches)).toEqual([
            "Cache",
            "Database",
            "Web Server",
        ]);
        expect(suggestion!.replaceFrom).toBe("add step".length);
        expect(suggestion!.replaceTo).toBe("add step".length);
    });

    test("caps suggestions at the given limit", () => {
        const many: Architecture = {
            nodes: [
                "Alpha",
                "Bravo",
                "Charlie",
                "Delta",
                "Echo",
                "Foxtrot",
                "Golf",
                "Hotel",
                "India",
            ].map((label, i) => ({
                id: `node-${i}`,
                position: { x: 0, y: 0 },
                data: { label },
            })),
            edges: [],
        };

        const input = "remove node  ";
        const suggestion = suggestNodeReference(input, many, input.length, 5);

        expect(suggestion!.matches).toHaveLength(5);
        expect(labels(suggestion!.matches)).toEqual([
            "Alpha",
            "Bravo",
            "Charlie",
            "Delta",
            "Echo",
        ]);
    });
});

describe("applyNodeSuggestion", () => {
    test("inserts the label and a trailing space in place of the matched span", () => {
        const input = "remove node Da";
        const suggestion = suggestNodeReference(input, architecture)!;

        const result = applyNodeSuggestion(input, suggestion, {
            id: "node-database",
            position: { x: 0, y: 0 },
            data: { label: "Database" },
        });

        expect(result.value).toBe("remove node Database ");
        expect(result.cursor).toBe(result.value.length);
    });

    test("adds a leading space when the replaced span sits at the end with no separating space yet", () => {
        const input = "add step";
        const suggestion = suggestNodeReference(input, architecture)!;

        const result = applyNodeSuggestion(input, suggestion, {
            id: "node-cache",
            position: { x: 0, y: 0 },
            data: { label: "Cache" },
        });

        expect(result.value).toBe("add step Cache ");
    });

    test("preserves text after the replaced span", () => {
        const input = "connect Web Server to Da and more";
        const suggestion: ReturnType<typeof suggestNodeReference> = {
            replaceFrom: input.indexOf("Da"),
            replaceTo: input.indexOf("Da") + 2,
            matches: [],
        };

        const result = applyNodeSuggestion(input, suggestion, {
            id: "node-database",
            position: { x: 0, y: 0 },
            data: { label: "Database" },
        });

        expect(result.value).toBe(
            "connect Web Server to Database  and more",
        );
    });

    test("fixing the first argument after the second is already typed keeps the second argument and lands the cursor before it", () => {
        const input = "connect Web Server to Cache";
        const cursor = input.indexOf("Web");
        const suggestion = suggestNodeReference(input, architecture, cursor)!;

        const result = applyNodeSuggestion(input, suggestion, {
            id: "node-database",
            position: { x: 0, y: 0 },
            data: { label: "Database" },
        });

        expect(result.value).toBe("connect Database  to Cache");
        expect(result.cursor).toBe("connect Database ".length);
    });
});

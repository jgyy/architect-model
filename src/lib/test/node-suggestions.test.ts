import { describe, expect, test } from "vitest";

import { buildNodeIndex } from "@/lib/architecture-commands";
import {
    applyNodeSuggestion,
    suggestNodeReference,
    suggestionIsCompleteMatch,
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
                {
                    id: "node-web",
                    position: { x: 0, y: 0 },
                    data: { label: "Web" },
                },
            ],
            edges: [],
        };

        const suggestion = suggestNodeReference("remove node Web", withWeb);

        expect(labels(suggestion!.matches)).toEqual(["Web", "Web Server"]);
    });

    test("suggests the source node while typing the first argument of 'connect'", () => {
        const suggestion = suggestNodeReference(
            "connect Web Ser",
            architecture,
        );

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

    test("does not split inside a node label that itself contains a separator word", () => {
        const withLoadToBalance: Architecture = {
            nodes: [
                {
                    id: "node-api",
                    position: { x: 0, y: 0 },
                    data: { label: "API" },
                },
                {
                    id: "node-load-to-balance",
                    position: { x: 250, y: 0 },
                    data: { label: "Load to Balance" },
                },
            ],
            edges: [],
        };

        const input = "connect API to Load to Bal";
        const suggestion = suggestNodeReference(input, withLoadToBalance);

        expect(labels(suggestion!.matches)).toEqual(["Load to Balance"]);
        expect(suggestion!.replaceFrom).toBe(input.indexOf("Load to Bal"));
        expect(suggestion!.replaceTo).toBe(input.length);
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

    test("treats a negative limit as zero instead of slicing from the end of the ranked list", () => {
        const input = "remove node  ";
        const suggestion = suggestNodeReference(
            input,
            architecture,
            input.length,
            -1,
        );

        expect(suggestion!.matches).toEqual([]);
    });

    test("matches a node label even when the typed text uses a different Unicode composition (NFD vs NFC)", () => {
        const nfc = "Caf\u00E9"; // precomposed e-acute
        const nfd = "Cafe\u0301"; // base "e" + combining acute accent
        expect(nfc).not.toBe(nfd);

        const withCafe: Architecture = {
            nodes: [
                {
                    id: "node-cafe",
                    position: { x: 0, y: 0 },
                    data: { label: nfc },
                },
            ],
            edges: [],
        };

        const suggestion = suggestNodeReference(`remove node ${nfd}`, withCafe);

        expect(labels(suggestion!.matches)).toEqual([nfc]);
    });

    test("suggests the node being renamed for the first argument of 'rename node'", () => {
        const suggestion = suggestNodeReference("rename node We", architecture);

        expect(labels(suggestion!.matches)).toEqual(["Web Server"]);
        expect(suggestion!.replaceFrom).toBe("rename node ".length);
        expect(suggestion!.replaceTo).toBe("rename node We".length);
    });

    test("suggests nothing for the new-label argument of 'rename node A to B', since it isn't a node reference", () => {
        const input = "rename node Web Server to Fronte";
        const suggestion = suggestNodeReference(input, architecture);

        expect(suggestion).toBeNull();
    });

    test('suggests the node being renamed for "relabel node", the rename alias', () => {
        const suggestion = suggestNodeReference(
            "relabel node We",
            architecture,
        );

        expect(labels(suggestion!.matches)).toEqual(["Web Server"]);
    });

    test("suggests the node being moved for the first argument of 'move node'", () => {
        const suggestion = suggestNodeReference("move node We", architecture);

        expect(labels(suggestion!.matches)).toEqual(["Web Server"]);
        expect(suggestion!.replaceFrom).toBe("move node ".length);
        expect(suggestion!.replaceTo).toBe("move node We".length);
    });

    test("suggests nothing for the step-number argument of 'move node A to step B', since it isn't a node reference", () => {
        const input = "move node Web Server to step 1";
        const suggestion = suggestNodeReference(input, architecture);

        expect(suggestion).toBeNull();
    });

    test('suggests the node being moved for "reorder node", the move alias', () => {
        const suggestion = suggestNodeReference(
            "reorder node We",
            architecture,
        );

        expect(labels(suggestion!.matches)).toEqual(["Web Server"]);
    });
});

describe("suggestNodeReference with a caller-supplied nodeIndex", () => {
    test("ranks identically to the default, freshly-built index", () => {
        const nodeIndex = buildNodeIndex(
            architecture.nodes,
            architecture.edges,
        );

        const input = "remove node Da";
        const withDefault = suggestNodeReference(input, architecture);
        const withExplicit = suggestNodeReference(
            input,
            architecture,
            undefined,
            undefined,
            nodeIndex,
        );

        expect(labels(withExplicit!.matches)).toEqual(
            labels(withDefault!.matches),
        );
    });

    test("only sees nodes present in the supplied index, even if architecture changed since", () => {
        const staleIndex = buildNodeIndex(
            architecture.nodes,
            architecture.edges,
        );
        const grown: Architecture = {
            nodes: [
                ...architecture.nodes,
                {
                    id: "node-data-lake",
                    position: { x: 0, y: 0 },
                    data: { label: "Data Lake" },
                },
            ],
            edges: [],
        };

        const suggestion = suggestNodeReference(
            "remove node Da",
            grown,
            undefined,
            undefined,
            staleIndex,
        );

        expect(labels(suggestion!.matches)).toEqual(["Database"]);
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
        const input = "remove node";
        const suggestion: ReturnType<typeof suggestNodeReference> = {
            replaceFrom: input.length,
            replaceTo: input.length,
            matches: [],
        };

        const result = applyNodeSuggestion(input, suggestion, {
            id: "node-cache",
            position: { x: 0, y: 0 },
            data: { label: "Cache" },
        });

        expect(result.value).toBe("remove node Cache ");
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

        expect(result.value).toBe("connect Web Server to Database  and more");
    });

    test("does not duplicate text when completing an argument whose match label contains a separator word", () => {
        const withLoadToBalance: Architecture = {
            nodes: [
                {
                    id: "node-api",
                    position: { x: 0, y: 0 },
                    data: { label: "API" },
                },
                {
                    id: "node-load-to-balance",
                    position: { x: 250, y: 0 },
                    data: { label: "Load to Balance" },
                },
            ],
            edges: [],
        };

        const input = "connect API to Load to Bal";
        const suggestion = suggestNodeReference(input, withLoadToBalance)!;

        const result = applyNodeSuggestion(input, suggestion, {
            id: "node-load-to-balance",
            position: { x: 250, y: 0 },
            data: { label: "Load to Balance" },
        });

        expect(result.value).toBe("connect API to Load to Balance ");
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

describe("suggestionIsCompleteMatch", () => {
    test("is true when the typed argument already exactly matches the single suggested node", () => {
        const input = "remove node Web Server";
        const suggestion = suggestNodeReference(input, architecture)!;

        expect(suggestionIsCompleteMatch(input, suggestion)).toBe(true);
    });

    test("is false while the typed argument is still a partial match", () => {
        const input = "remove node Da";
        const suggestion = suggestNodeReference(input, architecture)!;

        expect(suggestionIsCompleteMatch(input, suggestion)).toBe(false);
    });

    test("is true when the typed argument exactly matches one node even if others merely contain it as a substring", () => {
        const withWeb: Architecture = {
            nodes: [
                ...architecture.nodes,
                {
                    id: "node-web",
                    position: { x: 0, y: 0 },
                    data: { label: "Web" },
                },
            ],
            edges: [],
        };
        const input = "remove node Web";
        const suggestion = suggestNodeReference(input, withWeb)!;

        // "Web" is an exact match for a real node
        expect(suggestionIsCompleteMatch(input, suggestion)).toBe(true);
    });

    test("is false when the argument matches multiple nodes and none is an exact match", () => {
        const withWeb: Architecture = {
            nodes: [
                ...architecture.nodes,
                {
                    id: "node-web",
                    position: { x: 0, y: 0 },
                    data: { label: "Web" },
                },
            ],
            edges: [],
        };
        const input = "remove node We";
        const suggestion = suggestNodeReference(input, withWeb)!;

        expect(labels(suggestion.matches)).toEqual(["Web", "Web Server"]);
        expect(suggestionIsCompleteMatch(input, suggestion)).toBe(false);
    });
});

import { describe, expect, test } from "vitest";

import { exampleArchitecture } from "@/data/example-architecture";

describe("exampleArchitecture", () => {
    test("every node has a unique id", () => {
        const ids = exampleArchitecture.nodes.map((node) => node.id);
        expect(new Set(ids).size).toBe(ids.length);
    });

    test("every node has a non-empty label", () => {
        for (const node of exampleArchitecture.nodes) {
            expect(typeof node.data.label).toBe("string");
            expect(node.data.label.trim().length).toBeGreaterThan(0);
        }
    });

    test("every edge's source references an id that exists among the nodes", () => {
        const nodeIds = new Set(
            exampleArchitecture.nodes.map((node) => node.id),
        );
        for (const edge of exampleArchitecture.edges) {
            expect(nodeIds.has(edge.source)).toBe(true);
        }
    });

    test("every edge's target references an id that exists among the nodes", () => {
        const nodeIds = new Set(
            exampleArchitecture.nodes.map((node) => node.id),
        );
        for (const edge of exampleArchitecture.edges) {
            expect(nodeIds.has(edge.target)).toBe(true);
        }
    });

    test("there are no duplicate edge ids", () => {
        const edgeIds = exampleArchitecture.edges.map((edge) => edge.id);
        expect(new Set(edgeIds).size).toBe(edgeIds.length);
    });
});

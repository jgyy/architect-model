// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";

import { ArchitectureCanvas } from "@/components/architecture-canvas";
import type { Architecture } from "@/types/architecture";

afterEach(cleanup);

const NODE_A = {
    id: "a",
    type: "default",
    position: { x: 0, y: 0 },
    data: { label: "Web Server" },
};
const NODE_B = {
    id: "b",
    type: "default",
    position: { x: 200, y: 0 },
    data: { label: "Database" },
};

const BOTH_EDGES: Architecture = {
    nodes: [NODE_A, NODE_B],
    edges: [
        { id: "edge-normal", source: "a", target: "b" },
        { id: "edge-self-loop", source: "a", target: "a" },
    ],
};

const NORMAL_EDGE_ONLY: Architecture = {
    nodes: [NODE_A, NODE_B],
    edges: [{ id: "edge-normal", source: "a", target: "b" }],
};

const SELF_LOOP_ONLY: Architecture = {
    nodes: [NODE_A, NODE_B],
    edges: [{ id: "edge-self-loop", source: "a", target: "a" }],
};

// ReactFlow only measures nodes (and thus computes real edge paths)
async function renderCanvas(
    architecture: Architecture,
    onEdgeDelete: (edgeId: string) => void = vi.fn(),
) {
    const result = render(
        <ArchitectureCanvas
            architecture={architecture}
            onNodesChange={vi.fn()}
            onNodeCreate={vi.fn()}
            onNodeRename={vi.fn()}
            onNodeDelete={vi.fn()}
            onEdgeCreate={vi.fn()}
            onEdgeDelete={onEdgeDelete}
        />,
    );
    await new Promise((resolve) => setTimeout(resolve, 10));
    return result;
}

describe("ArchitectureEdge", () => {
    test("renders a normal two-node edge and a self-loop edge without crashing", async () => {
        const { container } = await renderCanvas(BOTH_EDGES);
        const normalEdge = container.querySelector(
            '[data-id="edge-normal"] path',
        );
        const selfLoopEdge = container.querySelector(
            '[data-id="edge-self-loop"] path',
        );
        expect(normalEdge).toBeInTheDocument();
        expect(selfLoopEdge).toBeInTheDocument();
    });

    test("draws a self-loop path that arcs through an apex rather than degenerating to a point", async () => {
        // A same-source/target bezier would degenerate
        const { container } = await renderCanvas(SELF_LOOP_ONLY);
        const selfLoopPath = container.querySelector(
            '[data-id="edge-self-loop"] path',
        );
        expect(selfLoopPath?.getAttribute("d")).toMatch(/^M .* C .*/);
    });

    test("both edges each show a visible Remove edge button", async () => {
        await renderCanvas(BOTH_EDGES);
        expect(screen.getAllByTitle("Remove edge")).toHaveLength(2);
    });

    test("clicking the normal edge's Remove edge button calls onEdgeDelete with its id", async () => {
        const onEdgeDelete = vi.fn();
        await renderCanvas(NORMAL_EDGE_ONLY, onEdgeDelete);
        fireEvent.click(screen.getByTitle("Remove edge"));
        expect(onEdgeDelete).toHaveBeenCalledWith("edge-normal");
    });

    test("clicking the self-loop edge's Remove edge button calls onEdgeDelete with its id", async () => {
        const onEdgeDelete = vi.fn();
        await renderCanvas(SELF_LOOP_ONLY, onEdgeDelete);
        fireEvent.click(screen.getByTitle("Remove edge"));
        expect(onEdgeDelete).toHaveBeenCalledWith("edge-self-loop");
    });

    test("a normal left-to-right edge bows away from its own node (the standard, expected shape)", async () => {
        // a (x:0) -> b (x:200): b sits to the right of a, the normal case
        const { container } = await renderCanvas(NORMAL_EDGE_ONLY);
        const d = container
            .querySelector('[data-id="edge-normal"] path')
            ?.getAttribute("d");
        expect(d).toBeTruthy();

        const match = d!.match(
            /^M([\d.-]+),([\d.-]+) C([\d.-]+),([\d.-]+) ([\d.-]+),([\d.-]+) ([\d.-]+),([\d.-]+)$/,
        );
        expect(match).not.toBeNull();
        const [, sourceX, , sourceControlX, , targetControlX, , targetX] =
            match!.map(Number);

        // source's control point bows right (away from target)
        expect(sourceControlX).toBeGreaterThan(sourceX);
        expect(targetControlX).toBeLessThan(targetX);
    });

    test("an edge whose target has been reordered to the left of its source bows inward instead of looping around", async () => {
        // c (x:-200) sits to the LEFT of a (x:0)
        const reversedArchitecture: Architecture = {
            nodes: [
                NODE_A,
                {
                    id: "c",
                    type: "default",
                    position: { x: -200, y: 0 },
                    data: { label: "Cache" },
                },
            ],
            edges: [{ id: "edge-reversed", source: "a", target: "c" }],
        };
        const { container } = await renderCanvas(reversedArchitecture);
        const d = container
            .querySelector('[data-id="edge-reversed"] path')
            ?.getAttribute("d");
        expect(d).toBeTruthy();

        const match = d!.match(
            /^M([\d.-]+),([\d.-]+) C([\d.-]+),([\d.-]+) ([\d.-]+),([\d.-]+) ([\d.-]+),([\d.-]+)$/,
        );
        expect(match).not.toBeNull();
        const [, sourceX, , sourceControlX, , targetControlX, , targetX] =
            match!.map(Number);

        // Without the fix these would flip: the source's control point
        expect(sourceControlX).toBeLessThan(sourceX);
        expect(targetControlX).toBeGreaterThan(targetX);
    });

    test("keyboard-focusing the Remove edge button reveals and enables it, not just hovering does", async () => {
        await renderCanvas(NORMAL_EDGE_ONLY);
        const button = screen.getByTitle("Remove edge");

        expect(button).toHaveClass("opacity-0");
        expect(button).toHaveStyle({ pointerEvents: "none" });

        fireEvent.focus(button);
        expect(button).toHaveClass("opacity-100");
        expect(button).toHaveStyle({ pointerEvents: "all" });

        fireEvent.blur(button);
        expect(button).toHaveClass("opacity-0");
        expect(button).toHaveStyle({ pointerEvents: "none" });
    });
});

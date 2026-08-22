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
});

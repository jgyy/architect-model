// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ReactFlowProvider, Position, type NodeProps } from "@xyflow/react";
import { afterEach, describe, expect, test, vi } from "vitest";

import {
    ArchitectureNode,
    HighlightedNodeContext,
    NodeActionsContext,
    type NodeActions,
} from "@/components/architecture-node";
import type { ArchitectureNode as ArchitectureNodeType } from "@/types/architecture";

afterEach(cleanup);

function nodeProps(
    overrides: Partial<NodeProps<ArchitectureNodeType>> = {},
): NodeProps<ArchitectureNodeType> {
    return {
        id: "node-1",
        data: { label: "Web Server" },
        type: "default",
        dragging: false,
        zIndex: 0,
        selectable: true,
        deletable: true,
        selected: false,
        draggable: true,
        isConnectable: true,
        positionAbsoluteX: 0,
        positionAbsoluteY: 0,
        sourcePosition: Position.Right,
        targetPosition: Position.Left,
        ...overrides,
    };
}

function renderNode(
    props: Partial<NodeProps<ArchitectureNodeType>> = {},
    actions: Partial<NodeActions> = {},
) {
    const nodeActions: NodeActions = {
        onRename: vi.fn(),
        onDelete: vi.fn(),
        autoEditNodeId: null,
        onAutoEditConsumed: vi.fn(),
        ...actions,
    };
    render(
        <ReactFlowProvider>
            <NodeActionsContext.Provider value={nodeActions}>
                <ArchitectureNode {...nodeProps(props)} />
            </NodeActionsContext.Provider>
        </ReactFlowProvider>,
    );
    return nodeActions;
}

describe("ArchitectureNode", () => {
    test("renders the node label", () => {
        renderNode({ data: { label: "Cache" } });
        expect(screen.getByText("Cache")).toBeInTheDocument();
    });

    test("clicking the remove button calls onDelete with the node id", async () => {
        const user = userEvent.setup();
        const actions = renderNode({ id: "node-42" });
        await user.click(screen.getByTitle("Remove node"));
        expect(actions.onDelete).toHaveBeenCalledWith("node-42");
    });

    test("double-clicking the label enters edit mode with the label preselected", async () => {
        const user = userEvent.setup();
        renderNode({ data: { label: "Cache" } });
        await user.dblClick(screen.getByText("Cache"));
        expect(screen.getByDisplayValue("Cache")).toBeInTheDocument();
    });

    test("committing an edit with Enter calls onRename with the trimmed value", async () => {
        const user = userEvent.setup();
        const actions = renderNode({ id: "node-1", data: { label: "Cache" } });
        await user.dblClick(screen.getByText("Cache"));
        const input = screen.getByDisplayValue("Cache");
        await user.clear(input);
        await user.type(input, "  Redis  {enter}");
        expect(actions.onRename).toHaveBeenCalledWith("node-1", "Redis");
    });

    test("does not call onRename when the label is unchanged", async () => {
        const user = userEvent.setup();
        const actions = renderNode({ data: { label: "Cache" } });
        await user.dblClick(screen.getByText("Cache"));
        await user.keyboard("{enter}");
        expect(actions.onRename).not.toHaveBeenCalled();
    });

    test("pressing Escape cancels the edit and restores the original label", async () => {
        const user = userEvent.setup();
        const actions = renderNode({ data: { label: "Cache" } });
        await user.dblClick(screen.getByText("Cache"));
        const input = screen.getByDisplayValue("Cache");
        await user.clear(input);
        await user.type(input, "Redis{escape}");
        expect(screen.getByText("Cache")).toBeInTheDocument();
        expect(actions.onRename).not.toHaveBeenCalled();
    });

    test("blurring the input commits the edit", async () => {
        const user = userEvent.setup();
        const actions = renderNode({ id: "node-1", data: { label: "Cache" } });
        await user.dblClick(screen.getByText("Cache"));
        const input = screen.getByDisplayValue("Cache");
        await user.clear(input);
        await user.type(input, "Redis");
        await user.tab();
        expect(actions.onRename).toHaveBeenCalledWith("node-1", "Redis");
    });

    test("a node matching the highlighted context id gets the current styling", () => {
        render(
            <ReactFlowProvider>
                <HighlightedNodeContext.Provider
                    value={{
                        currentNodeId: "node-1",
                        traversedNodeIds: new Set(),
                    }}
                >
                    <ArchitectureNode {...nodeProps({ id: "node-1" })} />
                </HighlightedNodeContext.Provider>
            </ReactFlowProvider>,
        );
        expect(screen.getByText("Web Server").closest("div")).toHaveClass(
            "border-accent",
        );
    });

    test("a node in the traversed set (but not current) gets the traversed styling", () => {
        render(
            <ReactFlowProvider>
                <HighlightedNodeContext.Provider
                    value={{
                        currentNodeId: "node-2",
                        traversedNodeIds: new Set(["node-1"]),
                    }}
                >
                    <ArchitectureNode {...nodeProps({ id: "node-1" })} />
                </HighlightedNodeContext.Provider>
            </ReactFlowProvider>,
        );
        expect(screen.getByText("Web Server").closest("div")).toHaveClass(
            "border-danger",
        );
    });

    test("auto-edit hands off into edit mode on first render and clears itself", async () => {
        const onAutoEditConsumed = vi.fn();
        renderNode(
            { id: "node-1", data: { label: "Cache" } },
            { autoEditNodeId: "node-1", onAutoEditConsumed },
        );
        expect(screen.getByDisplayValue("Cache")).toBeInTheDocument();
        expect(onAutoEditConsumed).toHaveBeenCalled();
    });
});

// @vitest-environment jsdom
import {
    cleanup,
    fireEvent,
    render,
    screen,
    waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, test, vi } from "vitest";

import {
    ArchitectureCanvas,
    reconcileRenderNodes,
} from "@/components/architecture-canvas";
import type { Architecture, ArchitectureNode } from "@/types/architecture";

afterEach(cleanup);

function baseArchitecture(): Architecture {
    return {
        nodes: [
            {
                id: "a",
                type: "default",
                position: { x: 0, y: 0 },
                data: { label: "Web Server" },
            },
            {
                id: "b",
                type: "default",
                position: { x: 200, y: 0 },
                data: { label: "Database" },
            },
            {
                id: "c",
                type: "default",
                position: { x: 400, y: 0 },
                data: { label: "Cache" },
            },
        ],
        edges: [
            {
                id: "a-b",
                type: "default",
                source: "a",
                target: "b",
            },
        ],
    };
}

function defaultCanvasProps() {
    return {
        architecture: baseArchitecture(),
        onNodesChange: vi.fn<(nodes: ArchitectureNode[]) => void>(),
        onNodeCreate: vi
            .fn<(position: { x: number; y: number }) => string | null>()
            .mockReturnValue("new-node"),
        onNodeRename: vi
            .fn<(nodeId: string, newLabel: string) => boolean>()
            .mockReturnValue(true),
        onNodeDelete: vi.fn<(nodeId: string) => void>(),
        onEdgeCreate: vi.fn<(sourceId: string, targetId: string) => void>(),
        onEdgeDelete: vi.fn<(edgeId: string) => void>(),
    };
}

function canvasProps(
    overrides: Partial<ReturnType<typeof defaultCanvasProps>> = {},
) {
    return { ...defaultCanvasProps(), ...overrides };
}

// ReactFlow's onInit fires asynchronously (~1ms internally)
async function waitForFlowInit() {
    await new Promise((resolve) => setTimeout(resolve, 10));
}

describe("reconcileRenderNodes", () => {
    const a: ArchitectureNode = {
        id: "a",
        position: { x: 0, y: 0 },
        data: { label: "A" },
    };
    const b: ArchitectureNode = {
        id: "b",
        position: { x: 200, y: 0 },
        data: { label: "B" },
    };

    test("adopts the incoming array wholesale when nothing is being dragged", () => {
        const draggedA = { ...a, position: { x: 999, y: 999 } };
        const incomingA = { ...a, position: { x: 5, y: 5 } };

        const result = reconcileRenderNodes(
            [draggedA, b],
            [incomingA, b],
            null,
        );

        expect(result[0].position).toEqual({ x: 5, y: 5 });
    });

    test("preserves the dragged node's live position instead of snapping back to the incoming (pre-drag) one", () => {
        const draggedA = { ...a, position: { x: 999, y: 999 } };
        // The parent's architecture still has the pre-drag position
        const staleIncomingA = { ...a, position: { x: 0, y: 0 } };
        const renamedIncomingB = { ...b, data: { label: "Renamed B" } };

        const result = reconcileRenderNodes(
            [draggedA, b],
            [staleIncomingA, renamedIncomingB],
            "a",
        );

        expect(result[0].position).toEqual({ x: 999, y: 999 });
        // Other fields on the dragged node still adopt the incoming value
        expect(result[0].data.label).toBe("A");
        // A node that isn't being dragged reconciles normally
        expect(result[1].data.label).toBe("Renamed B");
    });

    test("reuses the exact incoming object reference when nothing changed for that node", () => {
        const result = reconcileRenderNodes([a, b], [a, b], null);

        expect(result[0]).toBe(a);
        expect(result[1]).toBe(b);
    });
});

describe("ArchitectureCanvas", () => {
    test("renders every node's label", () => {
        render(<ArchitectureCanvas {...canvasProps()} />);
        expect(screen.getByText("Web Server")).toBeInTheDocument();
        expect(screen.getByText("Database")).toBeInTheDocument();
        expect(screen.getByText("Cache")).toBeInTheDocument();
    });

    test("renders the configured edge without crashing", async () => {
        const { container } = render(<ArchitectureCanvas {...canvasProps()} />);
        // Edge geometry depends on node measurement
        await waitFor(() => {
            expect(container.querySelectorAll(".react-flow__edge").length).toBe(
                1,
            );
        });
    });

    describe("double-click to create a node", () => {
        test("a single click on the empty pane does not call onNodeCreate", async () => {
            const props = canvasProps();
            const { container } = render(<ArchitectureCanvas {...props} />);
            await waitForFlowInit();

            const pane = container.querySelector(".react-flow__pane");
            expect(pane).not.toBeNull();
            fireEvent.click(pane as Element, { clientX: 50, clientY: 50 });

            expect(props.onNodeCreate).not.toHaveBeenCalled();
        });

        test("double-clicking the empty pane calls onNodeCreate with a flow position", async () => {
            const props = canvasProps();
            const { container } = render(<ArchitectureCanvas {...props} />);
            await waitForFlowInit();

            const pane = container.querySelector(".react-flow__pane");
            expect(pane).not.toBeNull();
            fireEvent.click(pane as Element, { clientX: 50, clientY: 50 });
            fireEvent.click(pane as Element, { clientX: 50, clientY: 50 });

            expect(props.onNodeCreate).toHaveBeenCalledTimes(1);
            const [position] = props.onNodeCreate.mock.calls[0];
            expect(typeof position.x).toBe("number");
            expect(typeof position.y).toBe("number");
        });

        test("the newly created node auto-enters edit mode", async () => {
            const architecture = baseArchitecture();
            // Mirrors how a real parent responds to onNodeCreate
            const onNodeCreate = vi.fn((position: { x: number; y: number }) => {
                architecture.nodes = [
                    ...architecture.nodes,
                    {
                        id: "new-node",
                        type: "default",
                        position,
                        data: { label: "Node 4" },
                    },
                ];
                return "new-node";
            });
            const props = canvasProps({ architecture, onNodeCreate });
            const { container } = render(<ArchitectureCanvas {...props} />);
            await waitForFlowInit();

            const pane = container.querySelector(".react-flow__pane");
            fireEvent.click(pane as Element, { clientX: 50, clientY: 50 });
            fireEvent.click(pane as Element, { clientX: 50, clientY: 50 });

            expect(onNodeCreate).toHaveBeenCalledTimes(1);
            await waitFor(() => {
                expect(screen.getByDisplayValue("Node 4")).toBeInTheDocument();
            });
        });
    });

    describe("the 'Add node' button (a touch/keyboard-reachable alternative to double-clicking)", () => {
        test("clicking it calls onNodeCreate with a flow position, same as double-clicking the pane", async () => {
            const props = canvasProps();
            render(<ArchitectureCanvas {...props} />);
            await waitForFlowInit();

            await userEvent.setup().click(screen.getByTitle("Add node"));

            expect(props.onNodeCreate).toHaveBeenCalledTimes(1);
            const [position] = props.onNodeCreate.mock.calls[0];
            expect(typeof position.x).toBe("number");
            expect(typeof position.y).toBe("number");
        });

        test("the newly created node auto-enters edit mode, same as via double-click", async () => {
            const architecture = baseArchitecture();
            const onNodeCreate = vi.fn((position: { x: number; y: number }) => {
                architecture.nodes = [
                    ...architecture.nodes,
                    {
                        id: "new-node",
                        type: "default",
                        position,
                        data: { label: "Node 4" },
                    },
                ];
                return "new-node";
            });
            const props = canvasProps({ architecture, onNodeCreate });
            render(<ArchitectureCanvas {...props} />);
            await waitForFlowInit();

            await userEvent.setup().click(screen.getByTitle("Add node"));

            expect(onNodeCreate).toHaveBeenCalledTimes(1);
            await waitFor(() => {
                expect(screen.getByDisplayValue("Node 4")).toBeInTheDocument();
            });
        });
    });

    describe("connecting two nodes", () => {
        test("dragging from a source handle to another node's target handle calls onEdgeCreate", async () => {
            const props = canvasProps();
            const { container } = render(<ArchitectureCanvas {...props} />);
            await waitForFlowInit();

            const sourceHandle = container.querySelector(
                '.react-flow__handle.source[data-nodeid="a"]',
            );
            const targetHandle = container.querySelector(
                '.react-flow__handle.target[data-nodeid="c"]',
            );
            expect(sourceHandle).not.toBeNull();
            expect(targetHandle).not.toBeNull();

            const originalElementFromPoint = document.elementFromPoint;
            document.elementFromPoint = () => targetHandle as Element;
            try {
                fireEvent.mouseDown(sourceHandle as Element, {
                    clientX: 10,
                    clientY: 10,
                    button: 0,
                });
                fireEvent.mouseMove(document, { clientX: 200, clientY: 10 });
                fireEvent.mouseUp(targetHandle as Element, {
                    clientX: 200,
                    clientY: 10,
                });
            } finally {
                document.elementFromPoint = originalElementFromPoint;
            }

            expect(props.onEdgeCreate).toHaveBeenCalledWith("a", "c");
        });
    });

    describe("deleting a node", () => {
        test("clicking a node's remove button calls onNodeDelete with that node's id", async () => {
            const user = userEvent.setup();
            const props = canvasProps();
            render(<ArchitectureCanvas {...props} />);

            const buttons = screen.getAllByTitle("Remove node");
            expect(buttons.length).toBe(3);
            await user.click(buttons[1]);

            expect(props.onNodeDelete).toHaveBeenCalledWith("b");
        });
    });

    describe("deleting an edge", () => {
        test("clicking an edge's remove button calls onEdgeDelete with that edge's id", async () => {
            const props = canvasProps();
            render(<ArchitectureCanvas {...props} />);

            // Edge geometry depends on node measurement
            const button = await screen.findByTitle("Remove edge");
            fireEvent.click(button);

            expect(props.onEdgeDelete).toHaveBeenCalledWith("a-b");
        });
    });

    describe("renaming a node", () => {
        test("double-clicking a node's label and committing with Enter calls onNodeRename", () => {
            const props = canvasProps();
            render(<ArchitectureCanvas {...props} />);

            // Uses fireEvent rather than userEvent here
            fireEvent.doubleClick(screen.getByText("Web Server"));
            const input = screen.getByDisplayValue("Web Server");
            fireEvent.change(input, { target: { value: "Frontend" } });
            fireEvent.keyDown(input, { key: "Enter" });

            expect(props.onNodeRename).toHaveBeenCalledWith("a", "Frontend");
        });
    });

    describe("onNodesChange wiring", () => {
        test("does not fire for a render with no changes", async () => {
            const props = canvasProps();
            render(<ArchitectureCanvas {...props} />);
            await waitFor(() => {
                expect(screen.getByText("Web Server")).toBeInTheDocument();
            });
            expect(props.onNodesChange).not.toHaveBeenCalled();
        });

        // A real drag-to-reposition gesture goes through @xyflow/react's
    });
});

// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, test, vi } from "vitest";

import { SimulationTimeline } from "@/components/simulation-timeline";
import type { Architecture, ArchitectureNode } from "@/types/architecture";

afterEach(cleanup);

function makeNode(
    id: string,
    label: string,
    description: string,
): ArchitectureNode {
    return {
        id,
        type: "default",
        position: { x: 0, y: 0 },
        data: { label, description },
    };
}

function makeArchitecture(nodes: ArchitectureNode[]): Architecture {
    return { nodes, edges: [] };
}

function renderTimeline(
    architecture: Architecture,
    currentStepIndex: number,
    onStepChange = vi.fn(),
    onReorder = vi.fn(),
) {
    render(
        <SimulationTimeline
            architecture={architecture}
            currentStepIndex={currentStepIndex}
            onStepChange={onStepChange}
            onReorder={onReorder}
        />,
    );
    return { onStepChange, onReorder };
}

// jsdom has no DataTransfer constructor
function makeDataTransfer() {
    const store = new Map<string, string>();
    return {
        setData: (key: string, value: string) => store.set(key, value),
        getData: (key: string) => store.get(key) ?? "",
    };
}

function dragRow(fromText: string, toText: string) {
    const dataTransfer = makeDataTransfer();
    const from = screen.getByText(fromText).closest("li");
    const to = screen.getByText(toText).closest("li");
    if (!from || !to) throw new Error("row not found");
    fireEvent.dragStart(from, { dataTransfer });
    fireEvent.dragOver(to, { dataTransfer });
    fireEvent.drop(to, { dataTransfer });
    fireEvent.dragEnd(from, { dataTransfer });
}

const THREE_NODES = [
    makeNode("a", "Client", "Sends the request."),
    makeNode("b", "Server", "Handles the request."),
    makeNode("c", "Database", "Persists the result."),
];

describe("SimulationTimeline", () => {
    test("renders one list item per node, in order, each showing its numbered step description", () => {
        renderTimeline(makeArchitecture(THREE_NODES), 0);
        const items = screen.getAllByRole("listitem");
        expect(items).toHaveLength(3);
        expect(items[0]).toHaveTextContent("1. Sends the request.");
        expect(items[1]).toHaveTextContent("2. Handles the request.");
        expect(items[2]).toHaveTextContent("3. Persists the result.");
    });

    test("the item at currentStepIndex gets aria-current and the current styling", () => {
        renderTimeline(makeArchitecture(THREE_NODES), 1);
        const currentText = screen.getByText("2. Handles the request.");
        const currentButton = currentText.closest("button");
        expect(currentButton).toHaveAttribute("aria-current", "true");
        expect(currentButton).toHaveClass("bg-current-step/10");
        expect(currentText).toHaveClass("text-current-step");
        const dot = currentButton?.querySelector("span");
        expect(dot).toHaveClass("bg-current-step");
    });

    test("items before currentStepIndex get the traversed styling instead of the current styling", () => {
        renderTimeline(makeArchitecture(THREE_NODES), 2);
        const traversedText = screen.getByText("1. Sends the request.");
        const traversedButton = traversedText.closest("button");
        expect(traversedButton).toHaveAttribute("aria-current", "false");
        expect(traversedButton).not.toHaveClass("bg-current-step/10");
        expect(traversedText).not.toHaveClass("text-current-step");
        expect(traversedText).toHaveClass("text-foreground");
        const dot = traversedButton?.querySelector("span");
        expect(dot).toHaveClass("bg-danger");
    });

    test("items after currentStepIndex get neither the current nor the traversed styling", () => {
        renderTimeline(makeArchitecture(THREE_NODES), 0);
        const upcomingText = screen.getByText("3. Persists the result.");
        const upcomingButton = upcomingText.closest("button");
        expect(upcomingButton).toHaveAttribute("aria-current", "false");
        expect(upcomingButton).not.toHaveClass("bg-current-step/10");
        expect(upcomingText).not.toHaveClass("text-current-step");
        expect(upcomingText).toHaveClass("text-foreground");
        const dot = upcomingButton?.querySelector("span");
        expect(dot).not.toHaveClass("bg-danger");
        expect(dot).toHaveClass("bg-border-strong");
    });

    test("clicking an item calls onStepChange with that item's index", async () => {
        const user = userEvent.setup();
        const { onStepChange } = renderTimeline(
            makeArchitecture(THREE_NODES),
            0,
        );
        await user.click(screen.getByText("3. Persists the result."));
        expect(onStepChange).toHaveBeenCalledWith(2);
    });

    test("renders correctly with a single-node architecture", () => {
        renderTimeline(
            makeArchitecture([makeNode("only", "Solo", "Runs alone.")]),
            0,
        );
        const items = screen.getAllByRole("listitem");
        expect(items).toHaveLength(1);
        expect(items[0]).toHaveTextContent("1. Runs alone.");
        expect(
            screen.getByText("1. Runs alone.").closest("button"),
        ).toHaveAttribute("aria-current", "true");
    });

    test("renders an empty list without crashing when the architecture has no nodes", () => {
        renderTimeline(makeArchitecture([]), 0);
        expect(screen.getByRole("list")).toBeEmptyDOMElement();
        expect(screen.queryAllByRole("listitem")).toHaveLength(0);
    });

    test("every row is draggable", () => {
        renderTimeline(makeArchitecture(THREE_NODES), 0);
        for (const item of screen.getAllByRole("listitem")) {
            expect(item).toHaveAttribute("draggable", "true");
        }
    });

    test("dragging a row onto a later row calls onReorder with the dragged node's id and the drop target's index", () => {
        const { onReorder } = renderTimeline(makeArchitecture(THREE_NODES), 0);
        dragRow("1. Sends the request.", "3. Persists the result.");
        expect(onReorder).toHaveBeenCalledWith("a", 2);
    });

    test("dragging a row onto an earlier row calls onReorder with the dragged node's id and the drop target's index", () => {
        const { onReorder } = renderTimeline(makeArchitecture(THREE_NODES), 0);
        dragRow("3. Persists the result.", "1. Sends the request.");
        expect(onReorder).toHaveBeenCalledWith("c", 0);
    });

    test("dropping a row on itself does not call onReorder", () => {
        const { onReorder } = renderTimeline(makeArchitecture(THREE_NODES), 0);
        dragRow("2. Handles the request.", "2. Handles the request.");
        expect(onReorder).not.toHaveBeenCalled();
    });

    test("every row has a move-up and a move-down button", () => {
        renderTimeline(makeArchitecture(THREE_NODES), 0);
        for (const n of [1, 2, 3]) {
            expect(
                screen.getByRole("button", { name: `Move step ${n} up` }),
            ).toBeInTheDocument();
            expect(
                screen.getByRole("button", { name: `Move step ${n} down` }),
            ).toBeInTheDocument();
        }
    });

    test("the first row's move-up button is disabled", () => {
        renderTimeline(makeArchitecture(THREE_NODES), 0);
        expect(
            screen.getByRole("button", { name: "Move step 1 up" }),
        ).toBeDisabled();
    });

    test("the last row's move-down button is disabled", () => {
        renderTimeline(makeArchitecture(THREE_NODES), 0);
        expect(
            screen.getByRole("button", { name: "Move step 3 down" }),
        ).toBeDisabled();
    });

    test("middle rows have both move buttons enabled", () => {
        renderTimeline(makeArchitecture(THREE_NODES), 0);
        expect(
            screen.getByRole("button", { name: "Move step 2 up" }),
        ).toBeEnabled();
        expect(
            screen.getByRole("button", { name: "Move step 2 down" }),
        ).toBeEnabled();
    });

    test("clicking a row's move-down button calls onReorder with that node's id and the next index", async () => {
        const user = userEvent.setup();
        const { onReorder } = renderTimeline(makeArchitecture(THREE_NODES), 0);
        await user.click(
            screen.getByRole("button", { name: "Move step 1 down" }),
        );
        expect(onReorder).toHaveBeenCalledWith("a", 1);
    });

    test("clicking a row's move-up button calls onReorder with that node's id and the previous index", async () => {
        const user = userEvent.setup();
        const { onReorder } = renderTimeline(makeArchitecture(THREE_NODES), 0);
        await user.click(
            screen.getByRole("button", { name: "Move step 3 up" }),
        );
        expect(onReorder).toHaveBeenCalledWith("c", 1);
    });

    test("clicking a move button does not also call onStepChange", async () => {
        const user = userEvent.setup();
        const { onStepChange } = renderTimeline(
            makeArchitecture(THREE_NODES),
            0,
        );
        await user.click(
            screen.getByRole("button", { name: "Move step 1 down" }),
        );
        expect(onStepChange).not.toHaveBeenCalled();
    });

    test("a single-node architecture disables both move buttons on its only row", () => {
        renderTimeline(
            makeArchitecture([makeNode("only", "Solo", "Runs alone.")]),
            0,
        );
        expect(
            screen.getByRole("button", { name: "Move step 1 up" }),
        ).toBeDisabled();
        expect(
            screen.getByRole("button", { name: "Move step 1 down" }),
        ).toBeDisabled();
    });
});

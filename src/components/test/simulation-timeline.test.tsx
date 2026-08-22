// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
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
) {
    render(
        <SimulationTimeline
            architecture={architecture}
            currentStepIndex={currentStepIndex}
            onStepChange={onStepChange}
        />,
    );
    return onStepChange;
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
        expect(currentButton).toHaveClass("bg-accent/10");
        expect(currentText).toHaveClass("text-accent");
        const dot = currentButton?.querySelector("span");
        expect(dot).toHaveClass("bg-accent");
    });

    test("items before currentStepIndex get the traversed styling instead of the current styling", () => {
        renderTimeline(makeArchitecture(THREE_NODES), 2);
        const traversedText = screen.getByText("1. Sends the request.");
        const traversedButton = traversedText.closest("button");
        expect(traversedButton).toHaveAttribute("aria-current", "false");
        expect(traversedButton).not.toHaveClass("bg-accent/10");
        expect(traversedText).not.toHaveClass("text-accent");
        expect(traversedText).toHaveClass("text-foreground");
        const dot = traversedButton?.querySelector("span");
        expect(dot).toHaveClass("bg-danger");
    });

    test("items after currentStepIndex get neither the current nor the traversed styling", () => {
        renderTimeline(makeArchitecture(THREE_NODES), 0);
        const upcomingText = screen.getByText("3. Persists the result.");
        const upcomingButton = upcomingText.closest("button");
        expect(upcomingButton).toHaveAttribute("aria-current", "false");
        expect(upcomingButton).not.toHaveClass("bg-accent/10");
        expect(upcomingText).not.toHaveClass("text-accent");
        expect(upcomingText).toHaveClass("text-foreground");
        const dot = upcomingButton?.querySelector("span");
        expect(dot).not.toHaveClass("bg-danger");
        expect(dot).toHaveClass("bg-border-strong");
    });

    test("clicking an item calls onStepChange with that item's index", async () => {
        const user = userEvent.setup();
        const onStepChange = renderTimeline(makeArchitecture(THREE_NODES), 0);
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
});

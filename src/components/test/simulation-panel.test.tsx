// @vitest-environment jsdom
import {
    act,
    cleanup,
    fireEvent,
    render,
    screen,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { SimulationPanel } from "@/components/simulation-panel";
import { DEFAULT_SPEED_INDEX, PLAY_SPEEDS } from "@/lib/simulation";
import type { Architecture, ArchitectureNode } from "@/types/architecture";

afterEach(cleanup);

function node(
    id: string,
    label: string,
    description?: string,
): ArchitectureNode {
    return {
        id,
        type: "default",
        position: { x: 0, y: 0 },
        data: description === undefined ? { label } : { label, description },
    };
}

function architectureOf(...nodes: ArchitectureNode[]): Architecture {
    return { nodes, edges: [] };
}

const THREE_STEP_ARCHITECTURE = architectureOf(
    node("a", "A", "Request hits the load balancer."),
    node("b", "B", "Load balancer forwards to the API."),
    node("c", "C", "API reads from the database."),
);

type PanelProps = {
    architecture: Architecture;
    currentStepIndex: number;
    onStepChange: (index: number) => void;
    speedIndex: number;
    onSpeedChange: (index: number) => void;
};

function renderPanel(overrides: Partial<PanelProps> = {}) {
    const props: PanelProps = {
        architecture: THREE_STEP_ARCHITECTURE,
        currentStepIndex: 0,
        onStepChange: vi.fn(),
        speedIndex: DEFAULT_SPEED_INDEX,
        onSpeedChange: vi.fn(),
        ...overrides,
    };
    render(<SimulationPanel {...props} />);
    return props;
}

// Mirrors how a real parent wires SimulationPanel: onStepChange feeds back
// into currentStepIndex, which is what lets autoplay carry forward across
// steps instead of replaying the same step index forever.
function ControlledPanel({
    architecture,
    initialStepIndex = 0,
    onStepChange,
}: {
    architecture: Architecture;
    initialStepIndex?: number;
    onStepChange: (index: number) => void;
}) {
    const [stepIndex, setStepIndex] = useState(initialStepIndex);
    return (
        <SimulationPanel
            architecture={architecture}
            currentStepIndex={stepIndex}
            onStepChange={(index) => {
                onStepChange(index);
                setStepIndex(index);
            }}
            speedIndex={DEFAULT_SPEED_INDEX}
            onSpeedChange={() => {}}
        />
    );
}

describe("SimulationPanel", () => {
    describe("empty architecture", () => {
        test("renders nothing when architecture.nodes is empty", () => {
            const { container } = render(
                <SimulationPanel
                    architecture={{ nodes: [], edges: [] }}
                    currentStepIndex={0}
                    onStepChange={vi.fn()}
                    speedIndex={DEFAULT_SPEED_INDEX}
                    onSpeedChange={vi.fn()}
                />,
            );
            expect(container).toBeEmptyDOMElement();
        });
    });

    describe("step display", () => {
        test("shows the step counter and the current node's description", () => {
            renderPanel({ currentStepIndex: 1 });
            expect(screen.getByText("Step 2 / 3")).toBeInTheDocument();
            expect(
                screen.getByText("Load balancer forwards to the API."),
            ).toBeInTheDocument();
        });

        test("falls back to a generated description when the node has none", () => {
            renderPanel({
                architecture: architectureOf(node("a", "Cache")),
                currentStepIndex: 0,
            });
            expect(screen.getByText('Reaches "Cache".')).toBeInTheDocument();
        });
    });

    describe("Previous button", () => {
        test("is disabled at the first step", () => {
            renderPanel({ currentStepIndex: 0 });
            expect(screen.getByTitle("Previous step")).toBeDisabled();
        });

        test("is enabled past the first step and calls onStepChange with the prior index", async () => {
            const user = userEvent.setup();
            const props = renderPanel({ currentStepIndex: 1 });
            const button = screen.getByTitle("Previous step");
            expect(button).toBeEnabled();
            await user.click(button);
            expect(props.onStepChange).toHaveBeenCalledWith(0);
        });
    });

    describe("Next button", () => {
        test("is disabled at the last step", () => {
            renderPanel({ currentStepIndex: 2 });
            expect(screen.getByTitle("Next step")).toBeDisabled();
        });

        test("is enabled before the last step and calls onStepChange with the following index", async () => {
            const user = userEvent.setup();
            const props = renderPanel({ currentStepIndex: 1 });
            const button = screen.getByTitle("Next step");
            expect(button).toBeEnabled();
            await user.click(button);
            expect(props.onStepChange).toHaveBeenCalledWith(2);
        });
    });

    describe("Play/Pause button", () => {
        beforeEach(() => {
            vi.useFakeTimers();
        });

        afterEach(() => {
            vi.useRealTimers();
        });

        test("is disabled when there is only one step", () => {
            renderPanel({
                architecture: architectureOf(node("a", "A")),
                currentStepIndex: 0,
            });
            expect(screen.getByTitle("Play")).toBeDisabled();
        });

        test("is disabled at the last step while not playing", () => {
            renderPanel({ currentStepIndex: 2 });
            expect(screen.getByTitle("Play")).toBeDisabled();
        });

        test("clicking Play starts playback, flips the title to Pause, and advancing time triggers onStepChange to the next step", () => {
            const onStepChange = vi.fn();
            render(
                <ControlledPanel
                    architecture={THREE_STEP_ARCHITECTURE}
                    onStepChange={onStepChange}
                />,
            );
            fireEvent.click(screen.getByTitle("Play"));
            expect(screen.getByTitle("Pause")).toBeInTheDocument();

            act(() => {
                vi.advanceTimersByTime(
                    PLAY_SPEEDS[DEFAULT_SPEED_INDEX].intervalMs,
                );
            });
            expect(onStepChange).toHaveBeenCalledWith(1);
        });

        test("playback stops automatically once it advances past the last step", () => {
            const onStepChange = vi.fn();
            render(
                <ControlledPanel
                    architecture={architectureOf(
                        node("a", "A"),
                        node("b", "B"),
                    )}
                    onStepChange={onStepChange}
                />,
            );
            fireEvent.click(screen.getByTitle("Play"));

            // Step 0 -> 1, the last step: the panel schedules another timer
            // that immediately notices there is no next step and stops.
            act(() => {
                vi.advanceTimersByTime(
                    PLAY_SPEEDS[DEFAULT_SPEED_INDEX].intervalMs,
                );
            });
            expect(onStepChange).toHaveBeenCalledWith(1);
            expect(onStepChange).toHaveBeenCalledTimes(1);

            act(() => {
                vi.runOnlyPendingTimers();
            });
            expect(screen.getByTitle("Play")).toBeInTheDocument();
            expect(onStepChange).toHaveBeenCalledTimes(1);
        });
    });

    describe("speed select", () => {
        test("changing the selection calls onSpeedChange with the selected index", async () => {
            const user = userEvent.setup();
            const props = renderPanel();
            await user.selectOptions(
                screen.getByLabelText("Playback speed"),
                PLAY_SPEEDS[2].label,
            );
            expect(props.onSpeedChange).toHaveBeenCalledWith(2);
        });
    });
});

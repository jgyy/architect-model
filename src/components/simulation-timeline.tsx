"use client";

import { stepDescription } from "@/lib/simulation";
import type { Architecture } from "@/types/architecture";

type SimulationTimelineProps = {
    architecture: Architecture;
    currentStepIndex: number;
    onStepChange: (index: number) => void;
};

// All steps at a glance — click any to jump straight to it
export function SimulationTimeline({
    architecture,
    currentStepIndex,
    onStepChange,
}: SimulationTimelineProps) {
    return (
        <ol className="max-h-40 overflow-y-auto border-t border-border">
            {architecture.nodes.map((node, index) => {
                const isCurrent = index === currentStepIndex;
                const isTraversed = !isCurrent && index < currentStepIndex;
                return (
                    <li key={node.id}>
                        <button
                            type="button"
                            onClick={() => onStepChange(index)}
                            aria-current={isCurrent}
                            className={`flex w-full items-start gap-2 px-3 py-1.5 text-left text-xs hover:bg-border/40 ${
                                isCurrent ? "bg-accent/10" : ""
                            }`}
                        >
                            <span
                                className={`mt-1 h-2 w-2 shrink-0 rounded-full ${
                                    isCurrent
                                        ? "bg-accent"
                                        : isTraversed
                                          ? "bg-danger"
                                          : "bg-border-strong"
                                }`}
                            />
                            <span
                                className={`min-w-0 flex-1 truncate font-mono ${
                                    isCurrent
                                        ? "text-accent"
                                        : "text-foreground"
                                }`}
                            >
                                {index + 1}. {stepDescription(node)}
                            </span>
                        </button>
                    </li>
                );
            })}
        </ol>
    );
}

"use client";

import { useState } from "react";

import { stepDescription } from "@/lib/simulation";
import type { Architecture } from "@/types/architecture";

type SimulationTimelineProps = {
    architecture: Architecture;
    currentStepIndex: number;
    onStepChange: (index: number) => void;
    onReorder: (nodeId: string, toIndex: number) => void;
};

// All steps at a glance — click any to jump straight to it, or drag to reorder
export function SimulationTimeline({
    architecture,
    currentStepIndex,
    onStepChange,
    onReorder,
}: SimulationTimelineProps) {
    const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
    const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

    function endDrag() {
        setDraggedIndex(null);
        setDragOverIndex(null);
    }

    return (
        <ol className="max-h-40 overflow-y-auto border-t border-border">
            {architecture.nodes.map((node, index) => {
                const isCurrent = index === currentStepIndex;
                const isTraversed = !isCurrent && index < currentStepIndex;
                return (
                    <li
                        key={node.id}
                        draggable
                        onDragStart={(event) => {
                            setDraggedIndex(index);
                            event.dataTransfer?.setData("text/plain", node.id);
                        }}
                        onDragOver={(event) => {
                            event.preventDefault();
                            setDragOverIndex(index);
                        }}
                        onDrop={(event) => {
                            event.preventDefault();
                            if (
                                draggedIndex !== null &&
                                draggedIndex !== index
                            ) {
                                onReorder(
                                    architecture.nodes[draggedIndex].id,
                                    index,
                                );
                            }
                            endDrag();
                        }}
                        onDragEnd={endDrag}
                        className={
                            dragOverIndex === index && draggedIndex !== index
                                ? "border-t-2 border-accent"
                                : ""
                        }
                    >
                        <button
                            type="button"
                            onClick={() => onStepChange(index)}
                            aria-current={isCurrent}
                            className={`flex w-full items-start gap-2 px-3 py-1.5 text-left text-xs hover:bg-border/40 ${
                                isCurrent ? "bg-accent/10" : ""
                            } ${draggedIndex === index ? "opacity-40" : ""}`}
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

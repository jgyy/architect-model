"use client";

import { ChevronDown, ChevronUp } from "lucide-react";
import { useState } from "react";

import { stepDescription } from "@/lib/simulation";
import type { Architecture } from "@/types/architecture";

type SimulationTimelineProps = {
    architecture: Architecture;
    currentStepIndex: number;
    onStepChange: (index: number) => void;
    onReorder: (nodeId: string, toIndex: number) => void;
};

// All steps at a glance - click any to jump straight to it, or drag to reorder
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

    const lastIndex = architecture.nodes.length - 1;

    return (
        <ol className="max-h-40 overflow-y-auto border-t border-border">
            {architecture.nodes.map((node, index) => {
                const isCurrent = index === currentStepIndex;
                const isTraversed = !isCurrent && index < currentStepIndex;
                const stepNumber = index + 1;
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
                        className={`flex items-stretch ${
                            dragOverIndex === index && draggedIndex !== index
                                ? "border-t-2 border-accent"
                                : ""
                        }`}
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
                                {stepNumber}. {stepDescription(node)}
                            </span>
                        </button>
                        {/* self-center (not items-stretch's default) keeps this
                        pair short, leaving blank space above/below it in the
                        row for vertical-scroll gestures to land on */}
                        <div className="flex shrink-0 items-center gap-0.5 self-center border-l border-border px-1.5">
                            <button
                                type="button"
                                onClick={() => onReorder(node.id, index - 1)}
                                disabled={index === 0}
                                title="Move up"
                                aria-label={`Move step ${stepNumber} up`}
                                className="flex items-center rounded p-1 text-muted-foreground hover:bg-border/40 hover:text-foreground disabled:opacity-30"
                            >
                                <ChevronUp size={12} />
                            </button>
                            <button
                                type="button"
                                onClick={() => onReorder(node.id, index + 1)}
                                disabled={index === lastIndex}
                                title="Move down"
                                aria-label={`Move step ${stepNumber} down`}
                                className="flex items-center rounded p-1 text-muted-foreground hover:bg-border/40 hover:text-foreground disabled:opacity-30"
                            >
                                <ChevronDown size={12} />
                            </button>
                        </div>
                    </li>
                );
            })}
        </ol>
    );
}

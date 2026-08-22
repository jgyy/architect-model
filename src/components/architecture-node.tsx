"use client";

import { createContext, useContext } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";

import type { ArchitectureNode as ArchitectureNodeType } from "@/types/architecture";

// Which node the simulation is currently on, and which it has already crossed
export type SimulationHighlight = {
    currentNodeId?: string;
    traversedNodeIds: Set<string>;
};

const EMPTY_HIGHLIGHT: SimulationHighlight = { traversedNodeIds: new Set() };

export const HighlightedNodeContext =
    createContext<SimulationHighlight>(EMPTY_HIGHLIGHT);

export function ArchitectureNode({
    id,
    data,
    selected,
}: NodeProps<ArchitectureNodeType>) {
    const { currentNodeId, traversedNodeIds } = useContext(
        HighlightedNodeContext,
    );
    const current = id === currentNodeId;
    const traversed = !current && traversedNodeIds.has(id);

    return (
        <div
            className={`rounded-lg border bg-chrome px-3 py-2 text-sm font-medium text-chrome-foreground shadow-sm transition-shadow hover:shadow-md ${
                current
                    ? "border-accent ring-2 ring-accent/30"
                    : traversed
                      ? "border-danger ring-2 ring-danger/30"
                      : selected
                        ? "border-accent/60 ring-1 ring-accent/20"
                        : "border-border"
            }`}
        >
            <Handle type="target" position={Position.Left} />
            {data.label}
            <Handle type="source" position={Position.Right} />
        </div>
    );
}

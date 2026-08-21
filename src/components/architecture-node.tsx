"use client";

import { createContext, useContext } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";

import type { ArchitectureNode as ArchitectureNodeType } from "@/types/architecture";

// Which node is currently highlighted by the simulation
export const HighlightedNodeContext = createContext<string | undefined>(
    undefined,
);

export function ArchitectureNode({
    id,
    data,
    selected,
}: NodeProps<ArchitectureNodeType>) {
    const highlightedNodeId = useContext(HighlightedNodeContext);
    const highlighted = id === highlightedNodeId;

    return (
        <div
            className={`rounded-lg border bg-chrome px-3 py-2 text-sm font-medium text-chrome-foreground shadow-sm transition-shadow hover:shadow-md ${
                highlighted
                    ? "border-accent ring-2 ring-accent/30"
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

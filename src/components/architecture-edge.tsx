"use client";

import { createContext, useContext, useState } from "react";
import {
    BaseEdge,
    EdgeLabelRenderer,
    getBezierPath,
    type EdgeProps,
} from "@xyflow/react";
import { X } from "lucide-react";

import type { ArchitectureEdge as ArchitectureEdgeType } from "@/types/architecture";

// Invoked with an edge's id to remove it — wired up by ArchitectureCanvas
export const EdgeDeleteContext = createContext<(edgeId: string) => void>(
    () => {},
);

export function ArchitectureEdge({
    id,
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
    style,
    markerEnd,
}: EdgeProps<ArchitectureEdgeType>) {
    const onDelete = useContext(EdgeDeleteContext);
    const [hovered, setHovered] = useState(false);
    const [edgePath, labelX, labelY] = getBezierPath({
        sourceX,
        sourceY,
        sourcePosition,
        targetX,
        targetY,
        targetPosition,
    });

    return (
        <>
            <BaseEdge
                id={id}
                path={edgePath}
                style={style}
                markerEnd={markerEnd}
            />
            {/* Wider invisible path so hovering near (not just exactly on) the
                thin edge line reveals the delete button */}
            <path
                d={edgePath}
                fill="none"
                stroke="transparent"
                strokeWidth={20}
                onMouseEnter={() => setHovered(true)}
                onMouseLeave={() => setHovered(false)}
            />
            <EdgeLabelRenderer>
                <button
                    type="button"
                    onMouseEnter={() => setHovered(true)}
                    onMouseLeave={() => setHovered(false)}
                    onClick={(event) => {
                        event.stopPropagation();
                        onDelete(id);
                    }}
                    title="Remove edge"
                    style={{
                        position: "absolute",
                        transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
                        pointerEvents: hovered ? "all" : "none",
                    }}
                    className={`flex h-5 w-5 items-center justify-center rounded-full border border-danger bg-chrome text-danger shadow-sm transition-opacity ${
                        hovered ? "opacity-100" : "opacity-0"
                    }`}
                >
                    <X size={12} />
                </button>
            </EdgeLabelRenderer>
        </>
    );
}

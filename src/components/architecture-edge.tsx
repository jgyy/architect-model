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

// Invoked with an edge's id to remove it - wired up by ArchitectureCanvas
export const EdgeDeleteContext = createContext<(edgeId: string) => void>(
    () => {},
);

const SELF_LOOP_CONTROL_OFFSET_X = 40;
const SELF_LOOP_HEIGHT = 60;

// A regular bezier degenerates when source and target are the same node
function getSelfLoopPath(
    sourceX: number,
    sourceY: number,
    targetX: number,
    targetY: number,
): [path: string, labelX: number, labelY: number] {
    const apexY = Math.min(sourceY, targetY) - SELF_LOOP_HEIGHT;
    const path = `M ${sourceX} ${sourceY} C ${sourceX + SELF_LOOP_CONTROL_OFFSET_X} ${apexY}, ${targetX - SELF_LOOP_CONTROL_OFFSET_X} ${apexY}, ${targetX} ${targetY}`;
    return [path, (sourceX + targetX) / 2, apexY];
}

export function ArchitectureEdge({
    id,
    source,
    target,
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
    const [edgePath, labelX, labelY] =
        source === target
            ? getSelfLoopPath(sourceX, sourceY, targetX, targetY)
            : getBezierPath({
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
            {/* Wider invisible path so hovering near thin edge line */}
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

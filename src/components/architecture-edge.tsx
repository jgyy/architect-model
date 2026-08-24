"use client";

import { createContext, useContext, useState } from "react";
import {
    BaseEdge,
    EdgeLabelRenderer,
    getBezierPath,
    Position,
    type EdgeProps,
} from "@xyflow/react";
import { X } from "lucide-react";

import type { ArchitectureEdge as ArchitectureEdgeType } from "@/types/architecture";

/**
 * React context letting an edge's delete button trigger removal without threading a prop
 * through React Flow's rendering. ArchitectureCanvas supplies the real handler; the no-op
 * default is a safe fallback with no provider mounted. Call with the edge's id.
 */
export const EdgeDeleteContext = createContext<(edgeId: string) => void>(
    () => {},
);

const SELF_LOOP_CONTROL_OFFSET_X = 40;
const SELF_LOOP_HEIGHT = 60;

/**
 * Builds the SVG path for a self-loop (source and target are the same node), since a regular
 * bezier degenerates when both endpoints coincide.
 * @param sourceX - loop start x-coordinate
 * @param sourceY - loop start y-coordinate
 * @param targetX - loop end x-coordinate
 * @param targetY - loop end y-coordinate
 * @returns the SVG path plus [x, y] label position above the arc's apex
 */
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

/**
 * Custom edge renderer for React Flow: draws a bezier curve (or self-loop arc) plus a
 * hover-revealed delete button at the midpoint. The only edge visual the canvas renders.
 * @param id - edge id, passed to the delete context on click
 * @param source - source node id
 * @param target - target node id (equals source for self-loop)
 * @param sourceX - source connection point x
 * @param sourceY - source connection point y
 * @param targetX - target connection point x
 * @param targetY - target connection point y
 * @param sourcePosition - source node side the edge exits
 * @param targetPosition - target node side the edge enters
 * @param style - React Flow's computed inline styles (e.g. selection highlight)
 * @param markerEnd - arrowhead marker to render at the edge's end
 */
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
    const [revealed, setRevealed] = useState(false);
    // Handles are fixed
    const isSelfLoop = source === target;
    const reversed = !isSelfLoop && targetX < sourceX;
    const [edgePath, labelX, labelY] = isSelfLoop
        ? getSelfLoopPath(sourceX, sourceY, targetX, targetY)
        : getBezierPath({
              sourceX,
              sourceY,
              sourcePosition: reversed ? Position.Left : sourcePosition,
              targetX,
              targetY,
              targetPosition: reversed ? Position.Right : targetPosition,
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
                onMouseEnter={() => setRevealed(true)}
                onMouseLeave={() => setRevealed(false)}
            />
            <EdgeLabelRenderer>
                <button
                    type="button"
                    onMouseEnter={() => setRevealed(true)}
                    onMouseLeave={() => setRevealed(false)}
                    onFocus={() => setRevealed(true)}
                    onBlur={() => setRevealed(false)}
                    onClick={(event) => {
                        event.stopPropagation();
                        onDelete(id);
                    }}
                    title="Remove edge"
                    style={{
                        position: "absolute",
                        transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
                        pointerEvents: revealed ? "all" : "none",
                    }}
                    className={`flex h-5 w-5 items-center justify-center rounded-full border border-danger bg-chrome text-danger shadow-sm transition-opacity ${
                        revealed ? "opacity-100" : "opacity-0"
                    }`}
                >
                    <X size={12} />
                </button>
            </EdgeLabelRenderer>
        </>
    );
}

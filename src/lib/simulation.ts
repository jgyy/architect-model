import type { Architecture, ArchitectureNode } from "@/types/architecture";

/** Autoplay speeds for the simulation trace; index doubles as the "current speed" index (see {@link DEFAULT_SPEED_INDEX}). */
export const PLAY_SPEEDS = [
    { label: "0.5x", intervalMs: 3000 },
    { label: "1x", intervalMs: 1500 },
    { label: "2x", intervalMs: 750 },
    { label: "4x", intervalMs: 375 },
];
/** Default {@link PLAY_SPEEDS} index for new simulations (1x). */
export const DEFAULT_SPEED_INDEX = 1;

/** Step's description, or a generated fallback for legacy nodes without one. */
export function stepDescription(node: ArchitectureNode): string {
    return node.data.description ?? `Reaches "${node.data.label}".`;
}

/**
 * Clamps a step index into [0, length-1] (0 if empty); guards stale indices after node changes.
 * @param index - candidate index
 * @param length - trace length
 */
export function clampStepIndex(index: number, length: number): number {
    return Math.min(Math.max(index, 0), Math.max(length - 1, 0));
}

/**
 * Next autoplay step index, or null once the trace is finished.
 * @param index - current step index
 * @param length - trace length
 */
export function getNextPlayIndex(index: number, length: number): number | null {
    const next = index + 1;
    return next < length ? next : null;
}

/** Node/edge ids traversed up to the current step, for canvas highlighting. */
export type TraversedPath = {
    nodeIds: Set<string>;
    edgeIds: Set<string>;
};

/**
 * Traversed ids as of currentStepIndex: a node counts if its array index <= step; an edge
 * counts once both endpoints do.
 * @param architecture - nodes (trace order) plus edges
 * @param currentStepIndex - step being viewed
 */
export function getTraversedPath(
    architecture: Architecture,
    currentStepIndex: number,
): TraversedPath {
    const nodes = architecture.nodes;
    const lastIndex = Math.min(currentStepIndex, nodes.length - 1);

    const nodeIds = new Set<string>();
    for (let i = 0; i <= lastIndex; i++) {
        nodeIds.add(nodes[i].id);
    }

    const edgeIds = new Set<string>();
    for (const edge of architecture.edges) {
        if (nodeIds.has(edge.source) && nodeIds.has(edge.target)) {
            edgeIds.add(edge.id);
        }
    }

    return { nodeIds, edgeIds };
}

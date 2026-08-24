import type { Architecture, ArchitectureNode } from "@/types/architecture";

/**
 * Autoplay speeds for the simulation trace (architecture nodes, in array order). Each pairs
 * a label with the step delay; the index also serves as "current speed" elsewhere (see
 * {@link DEFAULT_SPEED_INDEX}).
 */
export const PLAY_SPEEDS = [
    { label: "0.5x", intervalMs: 3000 },
    { label: "1x", intervalMs: 1500 },
    { label: "2x", intervalMs: 750 },
    { label: "4x", intervalMs: 375 },
];
/** Default {@link PLAY_SPEEDS} index for new simulations (1x). */
export const DEFAULT_SPEED_INDEX = 1;

/**
 * Narrative line for a simulation step: the node's own description, or a generated sentence
 * for nodes saved before descriptions existed.
 * @param node - the step's node
 * @returns the description text
 */
export function stepDescription(node: ArchitectureNode): string {
    return node.data.description ?? `Reaches "${node.data.label}".`;
}

/**
 * Clamps a step index to a trace's valid range, guarding against stale indices after nodes
 * are added or removed.
 * @param index - candidate index
 * @param length - steps in the trace
 * @returns clamped index in [0, length-1], or 0 if empty
 */
export function clampStepIndex(index: number, length: number): number {
    return Math.min(Math.max(index, 0), Math.max(length - 1, 0));
}

/**
 * Next step index for autoplay, or null once the trace is finished.
 * @param index - current step index
 * @param length - steps in the current trace
 * @returns next index, or null when already at the last step
 */
export function getNextPlayIndex(index: number, length: number): number | null {
    const next = index + 1;
    return next < length ? next : null;
}

/**
 * Nodes and edges traversed up to and including the current step; used by the canvas to
 * highlight the traversed path.
 */
export type TraversedPath = {
    nodeIds: Set<string>;
    edgeIds: Set<string>;
};

/**
 * Traversed path up to currentStepIndex: a node counts as traversed if its array position is
 * at or before the step; an edge counts once both endpoints do.
 * @param architecture - graph (nodes in trace order, plus edges)
 * @param currentStepIndex - step being viewed
 * @returns ids of traversed nodes and edges
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

import type { Architecture, ArchitectureNode } from "@/types/architecture";

export const PLAY_SPEEDS = [
    { label: "0.5x", intervalMs: 3000 },
    { label: "1x", intervalMs: 1500 },
    { label: "2x", intervalMs: 750 },
    { label: "4x", intervalMs: 375 },
];
export const DEFAULT_SPEED_INDEX = 1;

// Falls back for nodes persisted before descriptions existed on node data
export function stepDescription(node: ArchitectureNode): string {
    return node.data.description ?? `Reaches "${node.data.label}".`;
}

export function clampStepIndex(index: number, length: number): number {
    return Math.min(Math.max(index, 0), Math.max(length - 1, 0));
}

export function getNextPlayIndex(index: number, length: number): number | null {
    const next = index + 1;
    return next < length ? next : null;
}

export type TraversedPath = {
    nodeIds: Set<string>;
    edgeIds: Set<string>;
};

// The route an attacker has already crossed, from step 0 through currentStepIndex.
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

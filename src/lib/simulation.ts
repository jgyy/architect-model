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
// A node's step is simply its position in `architecture.nodes`, so this can
// never point at a node that no longer exists.
export function getTraversedPath(
    architecture: Architecture,
    currentStepIndex: number,
): TraversedPath {
    const nodes = architecture.nodes;
    const nodeIds = new Set<string>();
    const edgeIds = new Set<string>();
    const lastIndex = Math.min(currentStepIndex, nodes.length - 1);

    for (let i = 0; i <= lastIndex; i++) {
        nodeIds.add(nodes[i].id);
        if (i === 0) continue;
        const edge = architecture.edges.find(
            (candidate) =>
                candidate.source === nodes[i - 1].id &&
                candidate.target === nodes[i].id,
        );
        if (edge) edgeIds.add(edge.id);
    }

    return { nodeIds, edgeIds };
}

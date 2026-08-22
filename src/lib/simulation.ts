import type { Architecture, ArchitectureNode } from "@/types/architecture";
import type { SimulationStep } from "@/types/simulation";

export const PLAY_SPEEDS = [
    { label: "0.5x", intervalMs: 3000 },
    { label: "1x", intervalMs: 1500 },
    { label: "2x", intervalMs: 750 },
    { label: "4x", intervalMs: 375 },
];
export const DEFAULT_SPEED_INDEX = 1;

export function clampStepIndex(index: number, length: number): number {
    return Math.min(Math.max(index, 0), Math.max(length - 1, 0));
}

export function resolveStepNode(
    step: SimulationStep,
    architecture: Architecture,
): ArchitectureNode | undefined {
    return architecture.nodes.find((node) => node.id === step.nodeId);
}

export function getNextPlayIndex(index: number, length: number): number | null {
    const next = index + 1;
    return next < length ? next : null;
}

export type TraversedPath = {
    nodeIds: Set<string>;
    edgeIds: Set<string>;
};

// The route an attacker has already crossed, from step 0 through currentStepIndex
export function getTraversedPath(
    trace: SimulationStep[],
    architecture: Architecture,
    currentStepIndex: number,
): TraversedPath {
    const nodeIds = new Set<string>();
    const edgeIds = new Set<string>();
    const lastIndex = Math.min(currentStepIndex, trace.length - 1);

    for (let i = 0; i <= lastIndex; i++) {
        nodeIds.add(trace[i].nodeId);
        if (i === 0) continue;
        const edge = architecture.edges.find(
            (candidate) =>
                candidate.source === trace[i - 1].nodeId &&
                candidate.target === trace[i].nodeId,
        );
        if (edge) edgeIds.add(edge.id);
    }

    return { nodeIds, edgeIds };
}

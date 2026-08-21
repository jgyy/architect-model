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

export function getNextPlayIndex(
    index: number,
    length: number,
): number | null {
    const next = index + 1;
    return next < length ? next : null;
}

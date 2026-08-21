import type { Architecture, ArchitectureNode } from "@/types/architecture";
import type { SimulationStep } from "@/types/simulation";

export function clampStepIndex(index: number, length: number): number {
    return Math.min(Math.max(index, 0), Math.max(length - 1, 0));
}

export function resolveStepNode(
    step: SimulationStep,
    architecture: Architecture,
): ArchitectureNode | undefined {
    return architecture.nodes.find((node) => node.id === step.nodeId);
}

import type { Architecture } from "@/types/architecture";

// Synthesizes the same "remove edge A to B" text a user would type
export function buildRemoveEdgeCommand(
    edgeId: string,
    architecture: Architecture,
): string | null {
    const edge = architecture.edges.find(
        (candidate) => candidate.id === edgeId,
    );
    if (!edge) return null;

    const source = architecture.nodes.find((node) => node.id === edge.source);
    const target = architecture.nodes.find((node) => node.id === edge.target);
    if (!source || !target) return null;

    return `remove edge ${source.data.label} to ${target.data.label}`;
}

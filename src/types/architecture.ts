import type { Edge, Node } from "@xyflow/react";

export type ArchitectureNodeData = {
    label: string;
    // Simulation narrative for this node's step.
    description?: string;
};

export type ArchitectureNode = Node<ArchitectureNodeData>;

export type ArchitectureEdge = Edge;

export type Architecture = {
    nodes: ArchitectureNode[];
    edges: ArchitectureEdge[];
};

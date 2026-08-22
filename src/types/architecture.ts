import type { Edge, Node } from "@xyflow/react";

export type ArchitectureNodeData = {
    label: string;
    // Simulation narrative for this node's step. A node's position in the
    // simulation trace is simply its index in `Architecture.nodes` - there
    // is no separate step number to keep in sync.
    description?: string;
};

export type ArchitectureNode = Node<ArchitectureNodeData>;

export type ArchitectureEdge = Edge;

export type Architecture = {
    nodes: ArchitectureNode[];
    edges: ArchitectureEdge[];
};

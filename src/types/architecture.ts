import type { Edge, Node } from "@xyflow/react";

/**
 * Canvas node payload: label plus its simulation step, if any. The trace
 * is embedded here, not a separate structure.
 */
export type ArchitectureNodeData = {
    label: string;
    /** Simulation narrative, if the node participates in the trace. */
    description?: string;
};

/**
 * Canvas node: React Flow's `Node<T>` instantiated with this app's
 * `ArchitectureNodeData`.
 */
export type ArchitectureNode = Node<ArchitectureNodeData>;

/**
 * Edge between two nodes, reused as-is from React Flow's `Edge`. The
 * one-in/one-out chain rule is enforced by the command parser, not here.
 */
export type ArchitectureEdge = Edge;

/**
 * Full architecture graph: nodes and edges - the app's single source of
 * truth.
 */
export type Architecture = {
    nodes: ArchitectureNode[];
    edges: ArchitectureEdge[];
};

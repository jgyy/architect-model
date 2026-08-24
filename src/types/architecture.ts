import type { Edge, Node } from "@xyflow/react";

/**
 * Data payload for every canvas node: label plus, optionally, its step in the
 * simulation trace. The trace isn't a separate structure - it's embedded in
 * node order and each node's `description`.
 */
export type ArchitectureNodeData = {
    label: string;
    /**
     * Simulation narrative for this step, if the node participates.
     */
    description?: string;
};

/**
 * A canvas node as React Flow renders and manages it: React Flow's `Node<T>`
 * instantiated with this app's `ArchitectureNodeData`, so it inherits React
 * Flow's node fields (id, position, etc.) plus this app's `data` shape.
 */
export type ArchitectureNode = Node<ArchitectureNodeData>;

/**
 * An edge connecting two canvas nodes; reused as-is from React Flow's `Edge`
 * type since edges carry no extra data. The one-outgoing/one-incoming rule
 * (making the graph disjoint linear chains) is enforced by the command
 * parser, not this type.
 */
export type ArchitectureEdge = Edge;

/**
 * Full state of the architecture graph: every node and edge. Persisted,
 * imported/exported, and snapshotted for undo/redo - the app's single
 * source of truth.
 */
export type Architecture = {
    nodes: ArchitectureNode[];
    edges: ArchitectureEdge[];
};

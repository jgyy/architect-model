import {
    applyNodeChanges,
    type Connection,
    type NodeChange,
} from "@xyflow/react";

import type {
    Architecture,
    ArchitectureEdge,
    ArchitectureNode,
} from "@/types/architecture";

// Only "position" changes (dragging) are persisted.
export function applyPersistableNodeChanges(
    changes: NodeChange<ArchitectureNode>[],
    nodes: ArchitectureNode[],
): ArchitectureNode[] {
    const persistable = changes.filter((change) => change.type === "position");
    return persistable.length === 0
        ? nodes
        : applyNodeChanges(persistable, nodes);
}

// null when the connection is a self-loop or duplicates an existing edge
export function createEdgeFromConnection(
    connection: Connection,
    architecture: Architecture,
): ArchitectureEdge | null {
    const { source, target } = connection;
    if (!source || !target || source === target) return null;
    const alreadyConnected = architecture.edges.some(
        (edge) => edge.source === source && edge.target === target,
    );
    if (alreadyConnected) return null;
    return { id: `edge-${source}-${target}`, source, target };
}

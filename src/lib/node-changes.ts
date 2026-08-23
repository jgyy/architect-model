import { applyNodeChanges, type NodeChange } from "@xyflow/react";

import type { ArchitectureNode } from "@/types/architecture";

// Only a "position" change is persisted
function isSettledPositionChange(
    change: NodeChange<ArchitectureNode>,
): boolean {
    return change.type === "position" && change.dragging !== true;
}

export function applyPersistableNodeChanges(
    changes: NodeChange<ArchitectureNode>[],
    nodes: ArchitectureNode[],
): ArchitectureNode[] {
    const persistable = changes.filter(isSettledPositionChange);
    return persistable.length === 0
        ? nodes
        : applyNodeChanges(persistable, nodes);
}

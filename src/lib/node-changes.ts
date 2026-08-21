import { applyNodeChanges, type NodeChange } from "@xyflow/react";

import type { ArchitectureNode } from "@/types/architecture";

// Only "position" changes (dragging) are persisted
export function applyPersistableNodeChanges(
    changes: NodeChange<ArchitectureNode>[],
    nodes: ArchitectureNode[],
): ArchitectureNode[] {
    const persistable = changes.filter((change) => change.type === "position");
    return applyNodeChanges(persistable, nodes);
}

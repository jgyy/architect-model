import { applyNodeChanges, type NodeChange } from "@xyflow/react";

import type { ArchitectureNode } from "@/types/architecture";

/** True for a finished-drag "position" change (button released); React Flow fires one per pointer-move frame, so this filters to the settled one. */
function isSettledPositionChange(
    change: NodeChange<ArchitectureNode>,
): boolean {
    return change.type === "position" && change.dragging !== true;
}

/**
 * Applies only finished-drag changes, to avoid autosave spam from per-frame drag/selection changes.
 * @param changes - node changes for a render pass
 * @param nodes - current node list
 * @returns updated nodes, or `nodes` unchanged
 */
export function applyPersistableNodeChanges(
    changes: NodeChange<ArchitectureNode>[],
    nodes: ArchitectureNode[],
): ArchitectureNode[] {
    const persistable = changes.filter(isSettledPositionChange);
    return persistable.length === 0
        ? nodes
        : applyNodeChanges(persistable, nodes);
}

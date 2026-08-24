import { applyNodeChanges, type NodeChange } from "@xyflow/react";

import type { ArchitectureNode } from "@/types/architecture";

/**
 * Reports whether a node-change event is a finished drag: a "position" change
 * (not selection/dimension) whose mouse button is already released. React Flow
 * reports a new "position" change on every pointer-move frame while dragging,
 * so filtering to the settled one avoids treating one drag as dozens of changes.
 */
function isSettledPositionChange(
    change: NodeChange<ArchitectureNode>,
): boolean {
    return change.type === "position" && change.dragging !== true;
}

/**
 * Filters a batch of React Flow node changes to finished drags and applies
 * just those, so selection/in-progress-drag changes never trigger a save -
 * fixes drag-position autosave spam where every pointer-move frame would
 * otherwise queue a save.
 *
 * @param changes - batch of node changes for a render pass
 * @param nodes - current node list to apply onto
 * @returns node list with settled position changes applied, else `nodes` unchanged
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

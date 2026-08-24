import type { Architecture, ArchitectureNode } from "@/types/architecture";

function findNode(
    architecture: Architecture,
    id: string,
): ArchitectureNode | undefined {
    return architecture.nodes.find((node) => node.id === id);
}

/**
 * Builds "remove edge A to B" text so canvas edge deletions run through the console command path, not a direct mutation.
 * @returns command string, or null if edge/endpoint missing
 */
export function buildRemoveEdgeCommand(
    edgeId: string,
    architecture: Architecture,
): string | null {
    const edge = architecture.edges.find(
        (candidate) => candidate.id === edgeId,
    );
    if (!edge) return null;

    const source = findNode(architecture, edge.source);
    const target = findNode(architecture, edge.target);
    if (!source || !target) return null;

    return `remove edge ${source.data.label} to ${target.data.label}`;
}

/**
 * Builds "connect A to B" text for a drag-to-connect gesture, from React Flow's source/target node ids.
 * @returns command string, or null if either node missing
 */
export function buildConnectCommand(
    sourceId: string,
    targetId: string,
    architecture: Architecture,
): string | null {
    const source = findNode(architecture, sourceId);
    const target = findNode(architecture, targetId);
    if (!source || !target) return null;

    return `connect ${source.data.label} to ${target.data.label}`;
}

/**
 * Builds "rename node A to B" text for an inline canvas rename.
 * @returns command string, or null if node missing
 */
export function buildRenameNodeCommand(
    nodeId: string,
    newLabel: string,
    architecture: Architecture,
): string | null {
    const node = findNode(architecture, nodeId);
    if (!node) return null;

    return `rename node ${node.data.label} to ${newLabel}`;
}

/**
 * Builds "remove node A" text for a node deleted from the canvas.
 * @returns command string, or null if node missing
 */
export function buildRemoveNodeCommand(
    nodeId: string,
    architecture: Architecture,
): string | null {
    const node = findNode(architecture, nodeId);
    if (!node) return null;

    return `remove node ${node.data.label}`;
}

/**
 * Builds "move node A to step N" text for reordering a node within the simulation trace (the node array's order).
 * @returns command string, or null if node missing
 */
export function buildMoveNodeCommand(
    nodeId: string,
    targetPosition: number,
    architecture: Architecture,
): string | null {
    const node = findNode(architecture, nodeId);
    if (!node) return null;

    return `move node ${node.data.label} to step ${targetPosition}`;
}

/**
 * Picks the next unused "Node N" label, checked case-insensitively so it won't collide with a user-created one.
 * @returns e.g. "Node 3"
 */
export function nextDefaultNodeLabel(architecture: Architecture): string {
    const used = new Set(
        architecture.nodes.map((node) => node.data.label.toLowerCase()),
    );
    let n = architecture.nodes.length + 1;
    while (used.has(`node ${n}`.toLowerCase())) n += 1;
    return `Node ${n}`;
}

/** A click's screen position and timestamp, for double-click detection. */
export type ClickPoint = { x: number; y: number; time: number };

const DOUBLE_CLICK_MAX_INTERVAL_MS = 400;
const DOUBLE_CLICK_MAX_DISTANCE_PX = 10;

/**
 * Emulates double-click detection for React Flow's onPaneClick, which only ever reports single clicks.
 * @returns true if within the time/distance thresholds
 */
export function isDoubleClick(
    current: ClickPoint,
    previous: ClickPoint | null,
): boolean {
    if (!previous) return false;
    const withinTime =
        current.time - previous.time <= DOUBLE_CLICK_MAX_INTERVAL_MS;
    const distance = Math.hypot(current.x - previous.x, current.y - previous.y);
    return withinTime && distance <= DOUBLE_CLICK_MAX_DISTANCE_PX;
}

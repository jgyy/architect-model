import type { Architecture, ArchitectureNode } from "@/types/architecture";

function findNode(
    architecture: Architecture,
    id: string,
): ArchitectureNode | undefined {
    return architecture.nodes.find((node) => node.id === id);
}

/**
 * Builds "remove edge A to B" command text for an edge deleted on the
 * canvas, so it runs through the console path instead of a direct mutation.
 * Mirrors every canvas gesture in this file.
 *
 * @param edgeId - id of the removed edge
 * @param architecture - graph state used to resolve the edge and its endpoints
 * @returns the command string, or null if the edge or an endpoint can't be found
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
 * Builds "connect A to B" command text for a drag-to-connect gesture,
 * turning the source/target node ids React Flow reports into
 * typed-instruction text.
 *
 * @param sourceId - id of the drag's source node
 * @param targetId - id of the drop target node
 * @param architecture - graph state used to resolve both nodes
 * @returns the command string, or null if either node can't be found
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
 * Builds "rename node A to B" command text for an inline canvas rename.
 *
 * @param nodeId - id of the renamed node
 * @param newLabel - new label for the node
 * @param architecture - graph state used to resolve the node
 * @returns the command string, or null if the node can't be found
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
 * Builds "remove node A" command text for a node deleted from the canvas.
 *
 * @param nodeId - id of the removed node
 * @param architecture - graph state used to resolve the node
 * @returns the command string, or null if the node can't be found
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
 * Builds "move node A to step N" command text for reordering a node within
 * the simulation trace (the node array's order).
 *
 * @param nodeId - id of the moved node
 * @param targetPosition - target step number
 * @param architecture - graph state used to resolve the node
 * @returns the command string, or null if the node can't be found
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
 * Picks a default label ("Node N") for a node created on the canvas rather
 * than typed. Checks existing labels case-insensitively so it never
 * collides with a user-created "Node N".
 *
 * @param architecture - graph whose existing node labels are checked for collisions
 * @returns unused default label, e.g. "Node 3"
 */
export function nextDefaultNodeLabel(architecture: Architecture): string {
    const used = new Set(
        architecture.nodes.map((node) => node.data.label.toLowerCase()),
    );
    let n = architecture.nodes.length + 1;
    while (used.has(`node ${n}`.toLowerCase())) n += 1;
    return `Node ${n}`;
}

/**
 * A click's screen position and timestamp, recorded to detect double-clicks
 * (see isDoubleClick).
 */
export type ClickPoint = { x: number; y: number; time: number };

const DOUBLE_CLICK_MAX_INTERVAL_MS = 400;
const DOUBLE_CLICK_MAX_DISTANCE_PX = 10;

/**
 * Emulates native double-click detection for React Flow's onPaneClick,
 * which only ever reports single clicks. Two clicks count as a
 * double-click when close enough in time and distance.
 *
 * @param current - the click just received
 * @param previous - the previous click, or null if none yet
 * @returns true if the clicks form a double-click
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

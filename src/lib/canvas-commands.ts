import type { Architecture } from "@/types/architecture";

// Synthesizes the same "remove edge A to B" text a user would type
export function buildRemoveEdgeCommand(
    edgeId: string,
    architecture: Architecture,
): string | null {
    const edge = architecture.edges.find(
        (candidate) => candidate.id === edgeId,
    );
    if (!edge) return null;

    const source = architecture.nodes.find((node) => node.id === edge.source);
    const target = architecture.nodes.find((node) => node.id === edge.target);
    if (!source || !target) return null;

    return `remove edge ${source.data.label} to ${target.data.label}`;
}

// Synthesizes the same "connect A to B" text a user would type
export function buildConnectCommand(
    sourceId: string,
    targetId: string,
    architecture: Architecture,
): string | null {
    const source = architecture.nodes.find((node) => node.id === sourceId);
    const target = architecture.nodes.find((node) => node.id === targetId);
    if (!source || !target) return null;

    return `connect ${source.data.label} to ${target.data.label}`;
}

// Synthesizes the same "rename node A to B" text a user would type
export function buildRenameNodeCommand(
    nodeId: string,
    newLabel: string,
    architecture: Architecture,
): string | null {
    const node = architecture.nodes.find(
        (candidate) => candidate.id === nodeId,
    );
    if (!node) return null;

    return `rename node ${node.data.label} to ${newLabel}`;
}

// Synthesizes the same "remove node A" text a user would type
export function buildRemoveNodeCommand(
    nodeId: string,
    architecture: Architecture,
): string | null {
    const node = architecture.nodes.find(
        (candidate) => candidate.id === nodeId,
    );
    if (!node) return null;

    return `remove node ${node.data.label}`;
}

// Synthesizes the same "move node A to step N" text a user would type
export function buildMoveNodeCommand(
    nodeId: string,
    targetPosition: number,
    architecture: Architecture,
): string | null {
    const node = architecture.nodes.find(
        (candidate) => candidate.id === nodeId,
    );
    if (!node) return null;

    return `move node ${node.data.label} to step ${targetPosition}`;
}

// Default label offered when a node is created from the canvas rather than typed
export function nextDefaultNodeLabel(architecture: Architecture): string {
    const used = new Set(
        architecture.nodes.map((node) => node.data.label.toLowerCase()),
    );
    let n = architecture.nodes.length + 1;
    while (used.has(`node ${n}`.toLowerCase())) n += 1;
    return `Node ${n}`;
}

export type ClickPoint = { x: number; y: number; time: number };

const DOUBLE_CLICK_MAX_INTERVAL_MS = 400;
const DOUBLE_CLICK_MAX_DISTANCE_PX = 10;

// Emulates native double-click detection for React Flow's onPaneClick
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

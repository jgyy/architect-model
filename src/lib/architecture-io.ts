import {
    MAX_LABEL_LENGTH,
    NODE_X_SPACING,
    buildNodeIndex,
    slugify,
    uniqueNodeId,
    wouldCreateCycle,
} from "@/lib/architecture-commands";
import { foldLabel, normalizeLabel } from "@/lib/node-reference";
import { isValidArchitecture } from "@/lib/persistence";
import type {
    Architecture,
    ArchitectureEdge,
    ArchitectureNode,
} from "@/types/architecture";

export const ARCHITECTURE_EXPORT_FILENAME = "architecture.json";

// Pretty-printed so the download is readable if a reviewer opens it directly
export function serializeArchitecture(architecture: Architecture): string {
    return JSON.stringify(
        { nodes: architecture.nodes, edges: architecture.edges },
        null,
        2,
    );
}

export type ImportArchitectureResult =
    | {
          ok: true;
          architecture: Architecture;
          nodeCount: number;
          edgeCount: number;
      }
    | { ok: false; message: string };

// Detects a node stuck in a cycle.
function findCyclicNodeId(
    nodeIds: string[],
    outgoingBySource: Map<string, string>,
): string | null {
    const inDegree = new Map<string, number>(nodeIds.map((id) => [id, 0]));
    for (const target of outgoingBySource.values()) {
        inDegree.set(target, (inDegree.get(target) ?? 0) + 1);
    }
    const visited = new Set<string>();
    for (const id of nodeIds) {
        if ((inDegree.get(id) ?? 0) !== 0) continue;
        let current: string | undefined = id;
        while (current !== undefined) {
            visited.add(current);
            current = outgoingBySource.get(current);
        }
    }
    return nodeIds.find((id) => !visited.has(id)) ?? null;
}

// Re-checks the invariants the rest of the app assumes already hold
function validateImportedArchitecture(
    architecture: Architecture,
): string | null {
    const nodeIds = new Set<string>();
    const takenLabels = new Set<string>();
    for (const node of architecture.nodes) {
        if (nodeIds.has(node.id)) {
            return `Two nodes share the id "${node.id}".`;
        }
        nodeIds.add(node.id);

        if (
            !Number.isFinite(node.position.x) ||
            !Number.isFinite(node.position.y)
        ) {
            return `Node "${node.id}" has a non-finite position.`;
        }

        const label = normalizeLabel(node.data.label);
        if (label.length === 0) {
            return `Node "${node.id}" has a blank label.`;
        }
        if (label.length > MAX_LABEL_LENGTH) {
            return `Node "${node.id}"'s label is longer than ${MAX_LABEL_LENGTH} characters.`;
        }
        const folded = foldLabel(label);
        if (takenLabels.has(folded)) {
            return `Two nodes share the label "${label}".`;
        }
        takenLabels.add(folded);
    }

    const edgeIds = new Set<string>();
    const outgoingBySource = new Map<string, string>();
    const seenTargets = new Set<string>();
    for (const edge of architecture.edges) {
        if (edgeIds.has(edge.id)) {
            return `Two edges share the id "${edge.id}".`;
        }
        edgeIds.add(edge.id);
        if (!nodeIds.has(edge.source) || !nodeIds.has(edge.target)) {
            return `Edge "${edge.id}" references a node that doesn't exist.`;
        }
        if (outgoingBySource.has(edge.source)) {
            return `More than one edge starts from node "${edge.source}".`;
        }
        if (seenTargets.has(edge.target)) {
            return `More than one edge points to node "${edge.target}".`;
        }
        outgoingBySource.set(edge.source, edge.target);
        seenTargets.add(edge.target);
    }

    const cyclicId = findCyclicNodeId([...nodeIds], outgoingBySource);
    if (cyclicId) {
        return `The edges form a loop through node "${cyclicId}".`;
    }

    return null;
}

export function parseImportedArchitecture(
    raw: string,
): ImportArchitectureResult {
    let parsed: unknown;
    try {
        parsed = JSON.parse(raw);
    } catch {
        return { ok: false, message: "That file isn't valid JSON." };
    }

    if (!isValidArchitecture(parsed)) {
        return {
            ok: false,
            message:
                'That file doesn\'t match the expected format: { "nodes": [...], "edges": [...] }.',
        };
    }

    const problem = validateImportedArchitecture(parsed);
    if (problem) {
        return { ok: false, message: problem };
    }

    return {
        ok: true,
        architecture: parsed,
        nodeCount: parsed.nodes.length,
        edgeCount: parsed.edges.length,
    };
}

export type MergeArchitectureSuccess = {
    ok: true;
    architecture: Architecture;
    nodeCount: number;
    edgeCount: number;
    renamedLabels: string[];
};

// Disambiguates a label against the folded labels already in use
function uniqueLabel(label: string, takenFolded: Set<string>): string {
    let candidate = label;
    let suffix = 2;
    while (takenFolded.has(foldLabel(candidate))) {
        candidate = `${label} (${suffix})`;
        suffix += 1;
    }
    return candidate;
}

export type ConnectOrigin = "current" | "incoming";

// Namespaces a raw node id by which side of a merge it came from.
export function connectOptionKey(origin: ConnectOrigin, id: string): string {
    return `${origin}:${id}`;
}

export function decodeConnectOptionKey(key: string): {
    origin: ConnectOrigin;
    id: string;
} {
    const separatorIndex = key.indexOf(":");
    return {
        origin: key.slice(0, separatorIndex) as ConnectOrigin,
        id: key.slice(separatorIndex + 1),
    };
}

// Node/edge lists for the Connect control's cycle/degree checks
export function buildConnectGraph(
    current: Architecture,
    incomingNodes: ArchitectureNode[],
    incomingEdges: ArchitectureEdge[],
): { nodes: ArchitectureNode[]; edges: ArchitectureEdge[] } {
    const nodes = [
        ...current.nodes.map((node) => ({
            ...node,
            id: connectOptionKey("current", node.id),
        })),
        ...incomingNodes.map((node) => ({
            ...node,
            id: connectOptionKey("incoming", node.id),
        })),
    ];
    const edges = [
        ...current.edges.map((edge) => ({
            ...edge,
            source: connectOptionKey("current", edge.source),
            target: connectOptionKey("current", edge.target),
        })),
        ...incomingEdges.map((edge) => ({
            ...edge,
            source: connectOptionKey("incoming", edge.source),
            target: connectOptionKey("incoming", edge.target),
        })),
    ];
    return { nodes, edges };
}

// Ids of `nodes` with no outgoing edge in `edges` yet
export function connectableSourceIds(
    nodes: ArchitectureNode[],
    edges: ArchitectureEdge[],
): Set<string> {
    const index = buildNodeIndex(nodes, edges);
    return new Set(
        nodes
            .map((node) => node.id)
            .filter((id) => !index.outgoingBySource.has(id)),
    );
}

// Ids of `nodes` that `sourceId` could connect to without giving a node
export function connectableTargetIds(
    sourceId: string,
    nodes: ArchitectureNode[],
    edges: ArchitectureEdge[],
): Set<string> {
    const index = buildNodeIndex(nodes, edges);
    const ids = new Set<string>();
    for (const node of nodes) {
        if (node.id === sourceId) continue;
        if (index.incomingByTarget.has(node.id)) continue;
        if (wouldCreateCycle(sourceId, node.id, index)) continue;
        ids.add(node.id);
    }
    return ids;
}

// source/target are connect option keys (see connectOptionKey): "current:<id>"
export type AddedConnectEdge = { source: string; target: string };

function resolveConnectEndpoint(
    key: string,
    idRemap: ReadonlyMap<string, string>,
): string {
    const { origin, id } = decodeConnectOptionKey(key);
    return origin === "current" ? id : (idRemap.get(id) ?? id);
}

// Folds a subset of an already-parsed
export function mergeSelectedArchitecture(
    current: Architecture,
    incoming: Architecture,
    selectedNodeIds: ReadonlySet<string>,
    excludedEdgeIds: ReadonlySet<string> = new Set(),
    addedEdges: ReadonlyArray<AddedConnectEdge> = [],
    // Splice index into current.nodes where the incoming block lands;
    // current.nodes.length (the default) appends, matching prior behavior
    insertAtStep: number = current.nodes.length,
): MergeArchitectureSuccess {
    const selectedNodes = incoming.nodes.filter((node) =>
        selectedNodeIds.has(node.id),
    );
    const selectedNodeIdSet = new Set(selectedNodes.map((node) => node.id));
    const selectedEdges = incoming.edges.filter(
        (edge) =>
            selectedNodeIdSet.has(edge.source) &&
            selectedNodeIdSet.has(edge.target) &&
            !excludedEdgeIds.has(edge.id),
    );

    const index = buildNodeIndex(current.nodes, current.edges);
    const takenLabels = new Set(
        current.nodes.map((node) => foldLabel(node.data.label)),
    );
    const idRemap = new Map<string, string>();
    const renamedLabels: string[] = [];

    const incomingNodes = selectedNodes.map((node) => {
        let id = node.id;
        if (index.ids.has(id)) {
            id = uniqueNodeId(slugify(node.data.label), index);
            idRemap.set(node.id, id);
        }
        index.ids.add(id);

        let label = node.data.label;
        if (takenLabels.has(foldLabel(label))) {
            const renamed = uniqueLabel(label, takenLabels);
            renamedLabels.push(`"${label}" renamed to "${renamed}"`);
            label = renamed;
        }
        takenLabels.add(foldLabel(label));

        return { ...node, id, data: { ...node.data, label } };
    });

    const incomingEdges = selectedEdges.map((edge) => {
        const source = idRemap.get(edge.source) ?? edge.source;
        const target = idRemap.get(edge.target) ?? edge.target;
        return { ...edge, id: `edge-${source}-${target}`, source, target };
    });

    const manualEdges = addedEdges.map(
        ({ source: rawSource, target: rawTarget }) => {
            const source = resolveConnectEndpoint(rawSource, idRemap);
            const target = resolveConnectEndpoint(rawTarget, idRemap);
            return { id: `edge-${source}-${target}`, source, target };
        },
    );

    const before = current.nodes.slice(0, insertAtStep);
    const after = current.nodes.slice(insertAtStep);
    // Only the incoming block and whatever followed it shift step index;
    // `before` keeps its existing (possibly hand-dragged) positions.
    const shifted = [...incomingNodes, ...after].map((node, offset) => ({
        ...node,
        position: {
            ...node.position,
            x: (before.length + offset) * NODE_X_SPACING,
        },
    }));

    return {
        ok: true,
        architecture: {
            nodes: [...before, ...shifted],
            edges: [...current.edges, ...incomingEdges, ...manualEdges],
        },
        nodeCount: incomingNodes.length,
        edgeCount: incomingEdges.length + manualEdges.length,
        renamedLabels,
    };
}

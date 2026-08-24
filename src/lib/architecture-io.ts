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

/**
 * Serializes the architecture to JSON for export, keeping only `nodes`
 * and `edges` (see {@link parseImportedArchitecture}). Pretty-printed.
 *
 * @param architecture - The architecture to export.
 * @returns Indented JSON text.
 */
export function serializeArchitecture(architecture: Architecture): string {
    return JSON.stringify(
        { nodes: architecture.nodes, edges: architecture.edges },
        null,
        2,
    );
}

/**
 * Outcome of importing an architecture file. A discriminated union on
 * `ok` - callers must check `ok === true` before reading `architecture`,
 * so failure is handled rather than thrown. Success carries the
 * architecture and counts; failure carries a message.
 */
export type ImportArchitectureResult =
    | {
          ok: true;
          architecture: Architecture;
          nodeCount: number;
          edgeCount: number;
      }
    | { ok: false; message: string };

/**
 * Detects a node stuck in a cycle, given each node's outgoing edge
 * (`outgoingBySource`: source id to target id).
 *
 * First phase of Kahn's algorithm: compute in-degree per node, then walk
 * forward from every zero-in-degree node, marking visits. An unvisited
 * node is only reachable from within a cycle.
 *
 * @param nodeIds - All node ids to check.
 * @param outgoingBySource - Each node's outgoing edge, by source id.
 * @returns Id of a cyclic node, or null.
 */
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

/**
 * Re-checks every invariant the app assumes an `Architecture` satisfies:
 * unique node ids/labels, finite positions, label length limit, unique
 * edge ids, edges referencing real nodes, at most one outgoing/incoming
 * edge per node (chains, not an arbitrary graph), and no cycles.
 *
 * An imported file may be hand-edited or from another version, so these
 * checks are redone rather than trusted.
 *
 * @param architecture - Parsed, schema-valid architecture to check.
 * @returns Problem description, or null if valid.
 */
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

/**
 * Parses and validates an imported file's raw text into a ready-to-load
 * `Architecture`, or a rejection reason.
 *
 * @param raw - Raw text of the imported file.
 * @returns Parsed architecture and counts, or a failure message.
 */
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

/**
 * Result of folding a subset of an already-parsed architecture into the
 * current one (see {@link mergeSelectedArchitecture}). Only a success
 * case exists - merge runs after import validation.
 */
export type MergeArchitectureSuccess = {
    ok: true;
    architecture: Architecture;
    nodeCount: number;
    edgeCount: number;
    /** Notes on incoming labels renamed to avoid a collision, shown after merge. */
    renamedLabels: string[];
};

/**
 * Disambiguates a label against folded labels in use by appending
 * " (2)", " (3)", etc. until unique.
 *
 * @param label - Label to make unique.
 * @param takenFolded - Case-folded labels already taken (see {@link foldLabel}).
 * @returns A label not in `takenFolded`.
 */
function uniqueLabel(label: string, takenFolded: Set<string>): string {
    let candidate = label;
    let suffix = 2;
    while (takenFolded.has(foldLabel(candidate))) {
        candidate = `${label} (${suffix})`;
        suffix += 1;
    }
    return candidate;
}

/**
 * Which side of a merge a Connect control id came from: current or
 * incoming.
 */
export type ConnectOrigin = "current" | "incoming";

/**
 * Namespaces a raw node id by merge side, so Connect control dropdowns
 * can hold ids from both sides without collisions.
 *
 * @param origin - Which architecture the id belongs to.
 * @param id - The raw node id.
 * @returns Combined key: "current:\<id\>" or "incoming:\<id\>".
 */
export function connectOptionKey(origin: ConnectOrigin, id: string): string {
    return `${origin}:${id}`;
}

/**
 * Inverse of {@link connectOptionKey}: splits into origin and raw id.
 *
 * @param key - A key from {@link connectOptionKey}.
 * @returns The origin and raw id.
 */
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

/**
 * Builds a combined node/edge list, ids namespaced via
 * {@link connectOptionKey}, so checks can treat both architectures as
 * one graph.
 *
 * @param current - Architecture on the canvas.
 * @param incomingNodes - Nodes being imported.
 * @param incomingEdges - Edges being imported.
 * @returns Namespaced nodes and edges.
 */
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

/**
 * Nodes eligible as a new edge's source: those with no outgoing edge yet
 * (max one per node).
 *
 * @param nodes - Candidate nodes.
 * @param edges - Existing edges.
 * @returns Ids of `nodes` with no outgoing edge.
 */
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

/**
 * Finds which of `nodes` `sourceId` could validly connect to: excludes
 * `sourceId`, nodes with an incoming edge, and nodes where connecting
 * would create a cycle (`wouldCreateCycle`).
 *
 * @param sourceId - Id of the prospective source.
 * @param nodes - Candidate target nodes.
 * @param edges - Existing edges.
 * @returns Ids of valid targets.
 */
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

/**
 * An edge from the merge UI, unresolved: source/target are connect
 * option keys (see {@link connectOptionKey}).
 */
export type AddedConnectEdge = { source: string; target: string };

/**
 * Resolves one endpoint of a manually added edge to its real node id:
 * current-side ids pass through; incoming-side ids use their remap if
 * renamed.
 *
 * @param key - Connect option key naming the endpoint.
 * @param idRemap - Incoming ids renamed to avoid collision, old to new.
 * @returns The resolved node id.
 */
function resolveConnectEndpoint(
    key: string,
    idRemap: ReadonlyMap<string, string>,
): string {
    const { origin, id } = decodeConnectOptionKey(key);
    return origin === "current" ? id : (idRemap.get(id) ?? id);
}

/**
 * Folds a subset of an already-parsed incoming architecture into the
 * current one: picks nodes to keep (`selectedNodeIds`), edges to drop
 * (`excludedEdgeIds`), and edges to add by hand (`addedEdges`). Colliding
 * ids/labels are remapped/renamed, not rejected - structure was already
 * validated.
 *
 * @param current - Architecture on the canvas.
 * @param incoming - Already-validated architecture being merged in.
 * @param selectedNodeIds - Ids (from `incoming`) of nodes to bring in.
 * @param excludedEdgeIds - Ids (from `incoming`) of edges to leave out.
 * @param addedEdges - Extra edges to add, as connect option keys.
 * @param insertAtStep - Splice index into `current.nodes`; defaults to appending.
 * @returns Merged architecture, added counts, and renamed labels.
 */
export function mergeSelectedArchitecture(
    current: Architecture,
    incoming: Architecture,
    selectedNodeIds: ReadonlySet<string>,
    excludedEdgeIds: ReadonlySet<string> = new Set(),
    addedEdges: ReadonlyArray<AddedConnectEdge> = [],
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

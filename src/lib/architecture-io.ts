import {
    buildNodeIndex,
    slugify,
    uniqueNodeId,
    wouldCreateCycle,
} from "@/lib/architecture-commands";
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
    for (const node of architecture.nodes) {
        if (nodeIds.has(node.id)) {
            return `Two nodes share the id "${node.id}".`;
        }
        nodeIds.add(node.id);
    }

    const outgoingBySource = new Map<string, string>();
    const seenTargets = new Set<string>();
    for (const edge of architecture.edges) {
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

export type MergeArchitectureResult =
    MergeArchitectureSuccess | { ok: false; message: string };

// Exported so callers (e.g. the merge picker)
export function foldLabel(label: string): string {
    return label.normalize("NFC").toLowerCase();
}

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

// Ids of `nodes` with no outgoing edge in `edges` yet - eligible as the
// source of a manually-added connection
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

// Ids of `nodes` that `sourceId` could connect to without giving a node a
// second outgoing/incoming edge or closing a cycle
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

// Folds a subset of an already-parsed
export function mergeSelectedArchitecture(
    current: Architecture,
    incoming: Architecture,
    selectedNodeIds: ReadonlySet<string>,
    excludedEdgeIds: ReadonlySet<string> = new Set(),
    addedEdges: ReadonlyArray<{ source: string; target: string }> = [],
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
            const source = idRemap.get(rawSource) ?? rawSource;
            const target = idRemap.get(rawTarget) ?? rawTarget;
            return { id: `edge-${source}-${target}`, source, target };
        },
    );

    return {
        ok: true,
        architecture: {
            nodes: [...current.nodes, ...incomingNodes],
            edges: [...current.edges, ...incomingEdges, ...manualEdges],
        },
        nodeCount: incomingNodes.length,
        edgeCount: incomingEdges.length + manualEdges.length,
        renamedLabels,
    };
}

// Folds an entire incoming (already internally-valid)
export function mergeImportedArchitecture(
    current: Architecture,
    raw: string,
): MergeArchitectureResult {
    const parsed = parseImportedArchitecture(raw);
    if (!parsed.ok) return parsed;

    return mergeSelectedArchitecture(
        current,
        parsed.architecture,
        new Set(parsed.architecture.nodes.map((node) => node.id)),
    );
}

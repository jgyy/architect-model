import {
    buildNodeIndex,
    slugify,
    uniqueNodeId,
} from "@/lib/architecture-commands";
import { isValidArchitecture } from "@/lib/persistence";
import type { Architecture } from "@/types/architecture";

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

export type MergeArchitectureResult =
    | {
          ok: true;
          architecture: Architecture;
          nodeCount: number;
          edgeCount: number;
          renamedLabels: string[];
      }
    | { ok: false; message: string };

function foldLabel(label: string): string {
    return label.normalize("NFC").toLowerCase();
}

// Disambiguates a label against the folded labels already in use, mirroring
// uniqueNodeId's "-2, -3, ..." scheme
function uniqueLabel(label: string, takenFolded: Set<string>): string {
    let candidate = label;
    let suffix = 2;
    while (takenFolded.has(foldLabel(candidate))) {
        candidate = `${label} (${suffix})`;
        suffix += 1;
    }
    return candidate;
}

// Folds an incoming (already internally-valid) architecture into `current`,
// renaming any id/label that collides so every node stays uniquely
// addressable. The two node sets never end up sharing an id, so the merged
// graph can't violate the app's single-in/single-out/no-cycle invariants -
// there's nothing left to re-validate once the remap is done.
export function mergeImportedArchitecture(
    current: Architecture,
    raw: string,
): MergeArchitectureResult {
    const parsed = parseImportedArchitecture(raw);
    if (!parsed.ok) return parsed;

    const index = buildNodeIndex(current.nodes, current.edges);
    const takenLabels = new Set(
        current.nodes.map((node) => foldLabel(node.data.label)),
    );
    const idRemap = new Map<string, string>();
    const renamedLabels: string[] = [];

    const incomingNodes = parsed.architecture.nodes.map((node) => {
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

    const incomingEdges = parsed.architecture.edges.map((edge) => {
        const source = idRemap.get(edge.source) ?? edge.source;
        const target = idRemap.get(edge.target) ?? edge.target;
        return { ...edge, id: `edge-${source}-${target}`, source, target };
    });

    return {
        ok: true,
        architecture: {
            nodes: [...current.nodes, ...incomingNodes],
            edges: [...current.edges, ...incomingEdges],
        },
        nodeCount: parsed.nodeCount,
        edgeCount: parsed.edgeCount,
        renamedLabels,
    };
}

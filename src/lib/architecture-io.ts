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

// Detects a node stuck in a cycle. Fan-out is already capped at one edge per
// source (checked by the caller before this runs), so every node reachable
// from an in-degree-0 root sits on a simple path - walk once from each root
// and whatever's left unvisited afterwards must belong to a cycle instead.
// A self-loop (source === target) falls out of this for free: that node's
// only in-edge is its own out-edge, so it never has in-degree 0 and is never
// visited by any root walk.
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

// Re-checks the invariants the rest of the app assumes already hold (see
// connect() in architecture-commands.ts): unique node ids, edges that only
// reference real nodes, at most one outgoing/incoming edge per node, and no
// cycles. localStorage's own writes can be trusted to already satisfy these;
// an imported file can't be.
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

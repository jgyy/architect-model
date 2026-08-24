import { foldLabel } from "@/lib/node-reference";
import type { ArchitectureEdge, ArchitectureNode } from "@/types/architecture";

/**
 * Lookup Maps/Sets for an architecture's nodes and edges, built once per
 * command instead of re-derived on every access. See {@link buildNodeIndex}.
 */
export type NodeIndex = {
    /** Nodes keyed by folded label, for exact lookup. */
    byLabel: Map<string, ArchitectureNode>;
    /** Every node id currently in use, for collision checks. */
    ids: Set<string>;
    /** Every edge keyed by `"<sourceId>::<targetId>"` (see {@link edgeKey}). */
    edgesBySourceTarget: Map<string, ArchitectureEdge>;
    /**
     * Each node's single outgoing edge, keyed by source id. The parser
     * caps nodes at one outgoing/incoming edge each, so connected nodes
     * form disjoint chains, not an arbitrary graph.
     */
    outgoingBySource: Map<string, ArchitectureEdge>;
    /** Each node's single incoming edge, keyed by target id (see `outgoingBySource`). */
    incomingByTarget: Map<string, ArchitectureEdge>;
    /**
     * Root of the suffix trie for substring lookups over node labels - one
     * step per query character instead of scanning every label. See
     * {@link SubstringTrieNode}, {@link buildSubstringIndex}.
     */
    substringIndex: SubstringTrieNode;
};

export function edgeKey(sourceId: string, targetId: string): string {
    return `${sourceId}::${targetId}`;
}

/**
 * One trie node: edges keyed by the next folded character; each node
 * caches labels reachable through it, for substring matching.
 */
type SubstringTrieNode = {
    /** Child node per next folded character. */
    children: Map<string, SubstringTrieNode>;
    /** Nodes whose label contains this path's substring. */
    matches: Set<ArchitectureNode>;
};

function createSubstringTrieNode(): SubstringTrieNode {
    return { children: new Map(), matches: new Set() };
}

/**
 * Inserts every suffix of a node's folded label, so a later query can
 * match anywhere inside a label, not just its start.
 * @param root - trie root
 * @param node - node whose label is inserted
 */
function insertSuffixes(root: SubstringTrieNode, node: ArchitectureNode): void {
    const folded = foldLabel(node.data.label);
    for (let start = 0; start < folded.length; start += 1) {
        let current = root;
        for (let i = start; i < folded.length; i += 1) {
            const char = folded[i];
            let child = current.children.get(char);
            if (!child) {
                child = createSubstringTrieNode();
                current.children.set(char, child);
            }
            current = child;
            current.matches.add(node);
        }
    }
}

/**
 * Builds a suffix trie over every node's label for substring queries.
 * @param nodes - nodes to index
 * @returns root of the built trie
 */
function buildSubstringIndex(nodes: ArchitectureNode[]): SubstringTrieNode {
    const root = createSubstringTrieNode();
    for (const node of nodes) {
        insertSuffixes(root, node);
    }
    return root;
}

/**
 * Walks the trie by `needle`'s characters, returning every node whose
 * label contains it, in `architecture.nodes` order.
 * @param root - trie to search
 * @param needle - already-folded substring
 * @returns matching nodes, or `[]` if none
 */
function querySubstringIndex(
    root: SubstringTrieNode,
    needle: string,
): ArchitectureNode[] {
    let current = root;
    for (let i = 0; i < needle.length; i += 1) {
        const next = current.children.get(needle[i]);
        if (!next) return [];
        current = next;
    }
    return Array.from(current.matches);
}

/**
 * Public substring lookup for callers outside this module (e.g. UI
 * autocomplete), using the same trie the parser uses.
 * @param nodeIndex - index to query
 * @param needle - substring to search for
 * @returns nodes whose label contains `needle`
 */
export function findNodesBySubstring(
    nodeIndex: NodeIndex,
    needle: string,
): ArchitectureNode[] {
    return querySubstringIndex(nodeIndex.substringIndex, needle);
}

/**
 * Builds a {@link NodeIndex}: label lookup, id set, edge lookups, and
 * substring trie built up front so parsing reads Maps/Sets instead of
 * re-deriving them each access.
 * @param nodes - nodes to index
 * @param edges - edges to index (default none)
 * @returns a fresh index reflecting the given nodes/edges
 */
export function buildNodeIndex(
    nodes: ArchitectureNode[],
    edges: ArchitectureEdge[] = [],
): NodeIndex {
    const byLabel = new Map<string, ArchitectureNode>();
    const ids = new Set<string>();
    for (const node of nodes) {
        byLabel.set(foldLabel(node.data.label), node);
        ids.add(node.id);
    }
    const edgesBySourceTarget = new Map<string, ArchitectureEdge>();
    const outgoingBySource = new Map<string, ArchitectureEdge>();
    const incomingByTarget = new Map<string, ArchitectureEdge>();
    for (const edge of edges) {
        edgesBySourceTarget.set(edgeKey(edge.source, edge.target), edge);
        outgoingBySource.set(edge.source, edge);
        incomingByTarget.set(edge.target, edge);
    }
    return {
        byLabel,
        ids,
        edgesBySourceTarget,
        outgoingBySource,
        incomingByTarget,
        substringIndex: buildSubstringIndex(nodes),
    };
}

/**
 * True if connecting `sourceId` to `targetId` would close a loop (walks
 * forward from the target to the source). Used by `connect`.
 * @param sourceId - new edge's start id
 * @param targetId - new edge's end id
 * @param nodeIndex - forward-edge lookups
 * @returns true if a cycle would form
 */
export function wouldCreateCycle(
    sourceId: string,
    targetId: string,
    nodeIndex: NodeIndex,
): boolean {
    const visited = new Set<string>();
    let current = targetId;
    while (true) {
        if (current === sourceId) return true;
        if (visited.has(current)) return false;
        visited.add(current);
        const next = nodeIndex.outgoingBySource.get(current);
        if (!next) return false;
        current = next.target;
    }
}

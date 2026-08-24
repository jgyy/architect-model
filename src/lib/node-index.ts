import { foldLabel } from "@/lib/node-reference";
import type { ArchitectureEdge, ArchitectureNode } from "@/types/architecture";

/** Precomputed lookup Maps/Sets for a node/edge set; see {@link buildNodeIndex}. */
export type NodeIndex = {
    /** Nodes by folded label (exact lookup). */
    byLabel: Map<string, ArchitectureNode>;
    /** All node ids, for collision checks. */
    ids: Set<string>;
    /** Edges keyed by `"source::target"` (see {@link edgeKey}). */
    edgesBySourceTarget: Map<string, ArchitectureEdge>;
    /** Outgoing edge by source id. Nodes cap at one edge each way, so graphs form disjoint chains only. */
    outgoingBySource: Map<string, ArchitectureEdge>;
    /** Incoming edge by target id (see `outgoingBySource`). */
    incomingByTarget: Map<string, ArchitectureEdge>;
    /** Suffix trie root for substring label lookups (no full scan). See {@link SubstringTrieNode}. */
    substringIndex: SubstringTrieNode;
};

export function edgeKey(sourceId: string, targetId: string): string {
    return `${sourceId}::${targetId}`;
}

/** Trie node: child per next folded char; caches labels reachable through it. */
type SubstringTrieNode = {
    /** Child per next folded char. */
    children: Map<string, SubstringTrieNode>;
    /** Nodes whose label contains this path's substring. */
    matches: Set<ArchitectureNode>;
};

function createSubstringTrieNode(): SubstringTrieNode {
    return { children: new Map(), matches: new Set() };
}

/**
 * Inserts every suffix of the label so queries can match mid-label, not just the start.
 * @param root - trie root
 * @param node - node to insert
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

/** Builds a suffix trie over all node labels, for substring queries. */
function buildSubstringIndex(nodes: ArchitectureNode[]): SubstringTrieNode {
    const root = createSubstringTrieNode();
    for (const node of nodes) {
        insertSuffixes(root, node);
    }
    return root;
}

/**
 * Walks the trie by `needle`, returning matches in `architecture.nodes` order.
 * @param needle - must already be folded
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

/** Public substring lookup (e.g. UI autocomplete), reusing the parser's trie. */
export function findNodesBySubstring(
    nodeIndex: NodeIndex,
    needle: string,
): ArchitectureNode[] {
    return querySubstringIndex(nodeIndex.substringIndex, needle);
}

/** Builds a {@link NodeIndex} up front so parsing reads Maps/Sets instead of re-deriving them each time. */
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
 * True if `sourceId` → `targetId` would close a loop (walks forward from target to
 * source). Used by `connect`.
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

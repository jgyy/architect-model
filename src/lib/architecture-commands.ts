import {
    CONNECT_PATTERNS,
    CONNECT_SEPARATORS,
    DISCONNECT_SEPARATORS,
    MOVE_NODE_PATTERNS,
    MOVE_NODE_SEPARATORS,
    REMOVE_EDGE_PATTERNS,
    REMOVE_NODE_PATTERNS,
    RENAME_NODE_PATTERNS,
    RENAME_SEPARATORS,
    findSeparatorOccurrences,
    foldLabel,
    matchFirst,
    normalizeLabel,
    stripInvisibleChars,
} from "@/lib/node-reference";
import { COMMAND_USAGE } from "@/lib/supported-commands";
import type {
    Architecture,
    ArchitectureEdge,
    ArchitectureNode,
} from "@/types/architecture";

// One usage line per row instead of a semicolon-joined run-on sentence
const UNRECOGNIZED_COMMAND_USAGE = COMMAND_USAGE.map(
    (usage) => `  ${usage}`,
).join("\n");

/**
 * Result of running one command through {@link parseCommand}: a
 * discriminated union keyed on `ok`, forcing callers to check it before
 * reading `architecture`. A success carries the updated architecture plus
 * a message; a failure carries only the message.
 */
export type CommandResult =
    | {
          ok: true;
          architecture: Architecture;
          message: string;
      }
    | { ok: false; message: string };

/**
 * Checks whether a label is empty. Callers always pass an already-normalized
 * string, so this just checks length.
 */
function isBlankLabel(label: string): boolean {
    return label.length === 0;
}

/**
 * Upper bound on a node label's length, so canvas-synthesized commands
 * referencing it (e.g. "rename node <old> to <new>") stay under
 * `MAX_COMMAND_LENGTH` and reachable from the canvas's mouse actions.
 */
export const MAX_LABEL_LENGTH = 200;

function isTooLongLabel(label: string): boolean {
    return label.length > MAX_LABEL_LENGTH;
}

/**
 * Converts a label into a URL/id-safe slug: lowercased, non-alphanumeric
 * runs collapsed to a hyphen, edges trimmed.
 * @param label - label to slugify
 * @returns the slug; may be empty if the label had no alphanumeric characters
 */
export function slugify(label: string): string {
    return label
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/(^-|-$)/g, "");
}

/**
 * Builds a node id from a slug, appending a numeric suffix to avoid
 * collisions.
 * @param slug - base slug, see {@link slugify}
 * @param nodeIndex - checked for id collisions
 * @returns an id not already in `nodeIndex.ids`
 */
export function uniqueNodeId(slug: string, nodeIndex: NodeIndex): string {
    let id = `node-${slug}`;
    let suffix = 2;
    while (nodeIndex.ids.has(id)) {
        id = `node-${slug}-${suffix}`;
        suffix += 1;
    }
    return id;
}

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

function edgeKey(sourceId: string, targetId: string): string {
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

/**
 * Resolves a typed label to the {@link ArchitectureNode} it names: exact
 * match wins, else substring matching via the trie. One match resolves;
 * multiple is ambiguous; none (or blank) is nothing.
 * @param label - as-typed label text
 * @param nodeIndex - index to resolve against
 * @returns node, candidates if ambiguous, or null
 */
function findNodeOrAmbiguity(
    label: string,
    nodeIndex: NodeIndex,
): ArchitectureNode | ArchitectureNode[] | null {
    const needle = normalizeLabel(label).toLowerCase();
    if (needle.length === 0) return null;
    const exact = nodeIndex.byLabel.get(needle);
    if (exact) return exact;
    const matches = querySubstringIndex(nodeIndex.substringIndex, needle);
    if (matches.length === 0) return null;
    if (matches.length === 1) return matches[0];
    return matches;
}

const AMBIGUOUS_MATCHES_SHOWN = 20;

/**
 * Formats the error shown when a label substring-matches more than one
 * node: lists up to `AMBIGUOUS_MATCHES_SHOWN`, summarizing the rest as a
 * count.
 * @param label - the ambiguous label typed
 * @param matches - matched nodes
 * @returns message asking the user to be more specific
 */
function ambiguousLabelMessage(
    label: string,
    matches: ArchitectureNode[],
): string {
    const shown = matches
        .slice(0, AMBIGUOUS_MATCHES_SHOWN)
        .map((node) => `"${node.data.label}"`)
        .join(", ");
    const rest = matches.length - AMBIGUOUS_MATCHES_SHOWN;
    const names = rest > 0 ? `${shown}, and ${rest} more` : shown;
    return `"${label}" matches multiple nodes: ${names}. Be more specific.`;
}

function findNodeByExactLabel(
    label: string,
    nodeIndex: NodeIndex,
): ArchitectureNode | undefined {
    const needle = normalizeLabel(label).toLowerCase();
    return nodeIndex.byLabel.get(needle);
}

/**
 * Checks a candidate label for an exact duplicate among existing labels,
 * unlike the substring matching used to reference nodes. Shared by
 * `add node` and `rename node`.
 * @param label - candidate label
 * @param nodeIndex - index to check against
 * @returns failure if taken, else null
 */
function duplicateLabelError(
    label: string,
    nodeIndex: NodeIndex,
): CommandResult | null {
    const duplicate = findNodeByExactLabel(label, nodeIndex);
    return duplicate
        ? {
              ok: false,
              message: `A node named "${duplicate.data.label}" already exists.`,
          }
        : null;
}

/**
 * Splits text after a command's verb into every possible source/target
 * reading around each separator occurrence - a label can itself contain a
 * separator word. Caller picks the best reading later.
 * @param rest - text after the verb
 * @param separators - words/phrases to split on
 * @returns every possible split
 */
function splitConnectionArgs(
    rest: string,
    separators: string[],
): { sourceLabel: string; targetLabel: string }[] {
    return findSeparatorOccurrences(rest, separators).map(
        ({ index, length }) => ({
            sourceLabel: rest.slice(0, index).trim(),
            targetLabel: rest.slice(index + length).trim(),
        }),
    );
}

/**
 * Result of resolving a label: a single node on a clean match, candidates
 * when ambiguous, or null when nothing matches.
 */
type EndpointMatch = ArchitectureNode | ArchitectureNode[] | null;

/**
 * One candidate reading of `connect <A> to <B>`, pairing each side's raw
 * label with its resolved {@link EndpointMatch}. See
 * {@link resolveConnectionEndpoints}.
 */
type ResolvedEndpoints = {
    sourceLabel: string;
    targetLabel: string;
    source: EndpointMatch;
    target: EndpointMatch;
};

function isSingleNode(match: EndpointMatch): match is ArchitectureNode {
    return match !== null && !Array.isArray(match);
}

/**
 * True when `sourceLabel` is the resolved node's whole label, not just a
 * substring - used to prefer an exact match over an ambiguous split.
 * @param sourceLabel - raw label as typed
 * @param match - resolved {@link EndpointMatch}
 * @returns true if `match` is a single node equal to `sourceLabel`
 */
function isExactLabelMatch(sourceLabel: string, match: EndpointMatch): boolean {
    return (
        isSingleNode(match) &&
        foldLabel(normalizeLabel(sourceLabel)) === foldLabel(match.data.label)
    );
}

/**
 * Turns a raw {@link EndpointMatch} into the resolved node or a failure
 * message ("no node named…", or the ambiguity message).
 * @param label - raw label, for the error message
 * @param match - resolved {@link EndpointMatch}
 * @returns the node, or a failure with the message
 */
function requireNode(
    label: string,
    match: EndpointMatch,
): { ok: true; node: ArchitectureNode } | { ok: false; message: string } {
    if (match === null) {
        return { ok: false, message: `No node named "${label}".` };
    }
    if (Array.isArray(match)) {
        return { ok: false, message: ambiguousLabelMessage(label, match) };
    }
    return { ok: true, node: match };
}

/**
 * Resolves `connect`/`remove edge` args. Tries every split (see
 * {@link splitConnectionArgs}); first where both sides resolve to one node
 * wins, else the first split.
 * @param rest - command text after the verb
 * @param nodeIndex - index for label lookup
 * @param separators - words to split on
 * @returns best-guess endpoints, or null
 */
function resolveConnectionEndpoints(
    rest: string,
    nodeIndex: NodeIndex,
    separators: string[],
): ResolvedEndpoints | null {
    const splits = splitConnectionArgs(rest, separators);
    if (splits.length === 0) return null;

    const resolved = splits.map((split) => ({
        ...split,
        source: findNodeOrAmbiguity(split.sourceLabel, nodeIndex),
        target: findNodeOrAmbiguity(split.targetLabel, nodeIndex),
    }));

    return (
        resolved.find(
            (r) => isSingleNode(r.source) && isSingleNode(r.target),
        ) ?? resolved[0]
    );
}

/**
 * One candidate reading of `rename node <A> to <B>`, pairing the source's
 * raw label with its resolved {@link EndpointMatch} and the new label
 * text. Produced by {@link resolveRenameArgs}.
 */
type ResolvedRenameArgs = {
    sourceLabel: string;
    newLabel: string;
    source: EndpointMatch;
};

/**
 * Handles `rename node <A> to` with no new name typed yet: finds a
 * trailing separator, treats the text before it as the source label, and
 * returns a blank `newLabel` (so the caller reports "cannot be blank",
 * not "no separator found").
 * @param rest - text after the verb
 * @param nodeIndex - index for the source label
 * @param separators - separator words to look for
 * @returns args with empty `newLabel`, or null
 */
function resolveTrailingSeparatorWithBlankTarget(
    rest: string,
    nodeIndex: NodeIndex,
    separators: string[],
): ResolvedRenameArgs | null {
    const lower = rest.toLowerCase();
    const trimmedSeparator = separators.find((separator) =>
        lower.endsWith(separator.trimEnd()),
    );
    if (!trimmedSeparator) return null;
    // The whole (untouched) rest is itself a real, complete label - it
    // legitimately ends in the separator word (e.g. a node named "Say To"
    // referenced with no new name given at all), so stripping the trailing
    // "to" here would truncate that label rather than find a separator.
    if (isExactLabelMatch(rest, findNodeOrAmbiguity(rest, nodeIndex))) {
        return null;
    }
    const sourceLabel = rest
        .slice(0, rest.length - trimmedSeparator.trimEnd().length)
        .trim();
    return {
        sourceLabel,
        newLabel: "",
        source: findNodeOrAmbiguity(sourceLabel, nodeIndex),
    };
}

/**
 * Resolves `rename node <A> to <B>` args - only `<A>` is a node reference.
 * Prefers exact source match, then the blank-target case
 * ({@link resolveTrailingSeparatorWithBlankTarget}), then a single-node
 * split, else the first split.
 * @param rest - text after the verb
 * @param nodeIndex - index for the source label
 * @param separators - words to split on
 * @returns best-guess rename args, or null
 */
function resolveRenameArgs(
    rest: string,
    nodeIndex: NodeIndex,
    separators: string[],
): ResolvedRenameArgs | null {
    const splits = splitConnectionArgs(rest, separators);
    const trailingBlank = resolveTrailingSeparatorWithBlankTarget(
        rest,
        nodeIndex,
        separators,
    );
    if (splits.length === 0) return trailingBlank;

    const resolved = splits.map((split) => ({
        sourceLabel: split.sourceLabel,
        newLabel: split.targetLabel,
        source: findNodeOrAmbiguity(split.sourceLabel, nodeIndex),
    }));

    return (
        resolved.find((r) => isExactLabelMatch(r.sourceLabel, r.source)) ??
        // A real (non-blank-target) split only ever wins here
        (trailingBlank &&
        isExactLabelMatch(trailingBlank.sourceLabel, trailingBlank.source)
            ? trailingBlank
            : null) ??
        resolved.find((r) => isSingleNode(r.source)) ??
        resolved[0]
    );
}

/**
 * One candidate reading of `move node <label> to step <n>`, pairing the
 * node's raw label with its resolved {@link EndpointMatch} and the raw
 * step-number text. Produced by {@link resolveMoveNodeArgs}.
 */
type ResolvedMoveArgs = {
    sourceLabel: string;
    positionText: string;
    source: EndpointMatch;
};

/**
 * Resolves `move node <label> to step <n>` args - the right side is a step
 * number, not a node reference. Prefers an exact source match with
 * digits-only right side, then any single-node source, else the first
 * split.
 * @param rest - text after the verb
 * @param nodeIndex - index for the source label
 * @param separators - words to split on
 * @returns best-guess move args, or null
 */
function resolveMoveNodeArgs(
    rest: string,
    nodeIndex: NodeIndex,
    separators: string[],
): ResolvedMoveArgs | null {
    const splits = splitConnectionArgs(rest, separators);
    if (splits.length === 0) return null;

    const resolved = splits.map((split) => ({
        sourceLabel: split.sourceLabel,
        positionText: split.targetLabel.trim(),
        source: findNodeOrAmbiguity(split.sourceLabel, nodeIndex),
    }));

    return (
        resolved.find(
            (r) =>
                isExactLabelMatch(r.sourceLabel, r.source) &&
                /^\d+$/.test(r.positionText),
        ) ??
        resolved.find(
            (r) => isSingleNode(r.source) && /^\d+$/.test(r.positionText),
        ) ??
        resolved[0]
    );
}

const ADD_NODE_PATTERNS = [
    /^add node(?:\s+(.*))?$/i,
    /^create node(?:\s+(.*))?$/i,
    /^new node(?:\s+(.*))?$/i,
    /^add a node called(?:\s+(.*))?$/i,
];

/**
 * Extra input to {@link parseCommand} beyond the text, used by canvas
 * actions that synthesize commands but also carry info a typed command
 * wouldn't (e.g. a drop position).
 */
export type ParseCommandOptions = {
    /** Where a canvas-created node lands; a typed "add node" ignores this. */
    position?: { x: number; y: number };
};

const MAX_COMMAND_LENGTH = 500;

/**
 * Horizontal pixel gap between simulation steps - used when placing a new
 * node and re-laying-out `x` after `move node` reorders the chain. The
 * trace is just node array order (no separate structure), so spacing
 * visually communicates it.
 */
export const NODE_X_SPACING = 250;

/**
 * Parses one command line (typed or canvas-synthesized) into the
 * resulting architecture, if recognized. Sole parser for the six verbs
 * (add/connect/remove node, remove edge, rename node, move node) via
 * fixed per-verb regexes, not NLP/an LLM. Enforces invariants (valid
 * labels, edges only between distinct nodes, no cycles - see
 * {@link wouldCreateCycle}); returns a message on failure instead of
 * throwing, so callers (incl. the command log, doubling as the validation
 * UI) can show the reason.
 * @param input - raw command text to parse
 * @param architecture - architecture to apply the command to
 * @param options - extra input; see {@link ParseCommandOptions}
 * @param nodeIndex - prebuilt index; omit to build fresh
 * @returns the resulting {@link CommandResult}
 */
export function parseCommand(
    input: string,
    architecture: Architecture,
    options: ParseCommandOptions = {},
    nodeIndex: NodeIndex = buildNodeIndex(
        architecture.nodes,
        architecture.edges,
    ),
): CommandResult {
    // Strip before trimming
    const trimmed = stripInvisibleChars(input).trim();

    if (trimmed.length > MAX_COMMAND_LENGTH) {
        return {
            ok: false,
            message: `Command is too long (${trimmed.length} characters; max ${MAX_COMMAND_LENGTH}).`,
        };
    }

    const addNodeMatch = matchFirst(ADD_NODE_PATTERNS, trimmed);
    if (addNodeMatch) {
        const label = normalizeLabel(addNodeMatch[1] ?? "");
        if (isBlankLabel(label)) {
            return { ok: false, message: "A node label cannot be blank." };
        }
        if (isTooLongLabel(label)) {
            return {
                ok: false,
                message: `A node label can be at most ${MAX_LABEL_LENGTH} characters (got ${label.length}).`,
            };
        }
        const duplicateError = duplicateLabelError(label, nodeIndex);
        if (duplicateError) return duplicateError;
        const node: ArchitectureNode = {
            id: uniqueNodeId(slugify(label), nodeIndex),
            position: options.position ?? {
                x: architecture.nodes.length * NODE_X_SPACING,
                y: 0,
            },
            data: { label, description: `Reaches "${label}".` },
        };
        return {
            ok: true,
            architecture: {
                ...architecture,
                nodes: [...architecture.nodes, node],
            },
            message: `Added node "${label}" as simulation step ${architecture.nodes.length + 1}.`,
        };
    }

    const connectMatch = matchFirst(CONNECT_PATTERNS, trimmed);
    if (connectMatch) {
        const resolved = resolveConnectionEndpoints(
            connectMatch[1],
            nodeIndex,
            CONNECT_SEPARATORS,
        );
        if (!resolved) {
            return {
                ok: false,
                message: `Couldn't find a "to" or "and" separator in "${connectMatch[1]}". Try: connect <A> to <B>.`,
            };
        }
        const { sourceLabel, targetLabel } = resolved;
        const sourceResolution = requireNode(sourceLabel, resolved.source);
        if (!sourceResolution.ok) return sourceResolution;
        const targetResolution = requireNode(targetLabel, resolved.target);
        if (!targetResolution.ok) return targetResolution;
        const source = sourceResolution.node;
        const target = targetResolution.node;
        if (source.id === target.id) {
            return {
                ok: false,
                message: `"${source.data.label}" can't connect to itself.`,
            };
        }
        const existingOutgoing = nodeIndex.outgoingBySource.get(source.id);
        if (existingOutgoing) {
            if (existingOutgoing.target === target.id) {
                return {
                    ok: false,
                    message: `An edge from "${source.data.label}" to "${target.data.label}" already exists.`,
                };
            }
            const existingTarget = architecture.nodes.find(
                (n) => n.id === existingOutgoing.target,
            );
            return {
                ok: false,
                message: `"${source.data.label}" already connects to "${existingTarget?.data.label ?? existingOutgoing.target}"; a node can have only one outgoing connection.`,
            };
        }
        const existingIncoming = nodeIndex.incomingByTarget.get(target.id);
        if (existingIncoming) {
            const existingSource = architecture.nodes.find(
                (n) => n.id === existingIncoming.source,
            );
            return {
                ok: false,
                message: `"${target.data.label}" is already reached from "${existingSource?.data.label ?? existingIncoming.source}"; a node can have only one incoming connection.`,
            };
        }
        if (wouldCreateCycle(source.id, target.id, nodeIndex)) {
            return {
                ok: false,
                message: `Connecting "${source.data.label}" to "${target.data.label}" would create a circular loop.`,
            };
        }
        const edge = {
            id: `edge-${source.id}-${target.id}`,
            source: source.id,
            target: target.id,
        };
        return {
            ok: true,
            architecture: {
                ...architecture,
                edges: [...architecture.edges, edge],
            },
            message: `Connected "${source.data.label}" to "${target.data.label}".`,
        };
    }

    const removeNodeMatch = matchFirst(REMOVE_NODE_PATTERNS, trimmed);
    if (removeNodeMatch) {
        const label = removeNodeMatch[1].trim();
        const resolution = requireNode(
            label,
            findNodeOrAmbiguity(label, nodeIndex),
        );
        if (!resolution.ok) return resolution;
        const node = resolution.node;
        return {
            ok: true,
            architecture: {
                nodes: architecture.nodes.filter((n) => n.id !== node.id),
                edges: architecture.edges.filter(
                    (edge) =>
                        edge.source !== node.id && edge.target !== node.id,
                ),
            },
            message: `Removed node "${node.data.label}" and its simulation step.`,
        };
    }

    const removeEdgeMatch = matchFirst(REMOVE_EDGE_PATTERNS, trimmed);
    if (removeEdgeMatch) {
        const resolved = resolveConnectionEndpoints(
            removeEdgeMatch[1],
            nodeIndex,
            DISCONNECT_SEPARATORS,
        );
        if (!resolved) {
            return {
                ok: false,
                message: `Couldn't find a "to"/"from"/"and" separator in "${removeEdgeMatch[1]}". Try: remove edge <A> to <B>.`,
            };
        }
        const { sourceLabel, targetLabel } = resolved;
        const sourceResolution = requireNode(sourceLabel, resolved.source);
        if (!sourceResolution.ok) return sourceResolution;
        const targetResolution = requireNode(targetLabel, resolved.target);
        if (!targetResolution.ok) return targetResolution;
        const source = sourceResolution.node;
        const target = targetResolution.node;
        const edge = nodeIndex.edgesBySourceTarget.get(
            edgeKey(source.id, target.id),
        );
        if (!edge) {
            return {
                ok: false,
                message: `No edge from "${source.data.label}" to "${target.data.label}".`,
            };
        }
        return {
            ok: true,
            architecture: {
                ...architecture,
                edges: architecture.edges.filter((e) => e.id !== edge.id),
            },
            message: `Removed edge from "${source.data.label}" to "${target.data.label}".`,
        };
    }

    const renameNodeMatch = matchFirst(RENAME_NODE_PATTERNS, trimmed);
    if (renameNodeMatch) {
        const resolved = resolveRenameArgs(
            renameNodeMatch[1],
            nodeIndex,
            RENAME_SEPARATORS,
        );
        if (!resolved) {
            return {
                ok: false,
                message: `Couldn't find a "to" separator in "${renameNodeMatch[1]}". Try: rename node <A> to <B>.`,
            };
        }
        const { sourceLabel, newLabel } = resolved;
        const sourceResolution = requireNode(sourceLabel, resolved.source);
        if (!sourceResolution.ok) return sourceResolution;
        const source = sourceResolution.node;
        const normalizedNewLabel = normalizeLabel(newLabel);
        if (isBlankLabel(normalizedNewLabel)) {
            return { ok: false, message: "A node label cannot be blank." };
        }
        if (isTooLongLabel(normalizedNewLabel)) {
            return {
                ok: false,
                message: `A node label can be at most ${MAX_LABEL_LENGTH} characters (got ${normalizedNewLabel.length}).`,
            };
        }
        if (foldLabel(normalizedNewLabel) === foldLabel(source.data.label)) {
            return {
                ok: false,
                message: `"${source.data.label}" is already named that.`,
            };
        }
        const duplicateError = duplicateLabelError(
            normalizedNewLabel,
            nodeIndex,
        );
        if (duplicateError) return duplicateError;
        const renamedNodes = architecture.nodes.map((node) =>
            node.id === source.id
                ? {
                      ...node,
                      data: {
                          ...node.data,
                          label: normalizedNewLabel,
                          description: `Reaches "${normalizedNewLabel}".`,
                      },
                  }
                : node,
        );
        return {
            ok: true,
            architecture: { ...architecture, nodes: renamedNodes },
            message: `Renamed "${source.data.label}" to "${normalizedNewLabel}".`,
        };
    }

    const moveNodeMatch = matchFirst(MOVE_NODE_PATTERNS, trimmed);
    if (moveNodeMatch) {
        const resolved = resolveMoveNodeArgs(
            moveNodeMatch[1],
            nodeIndex,
            MOVE_NODE_SEPARATORS,
        );
        if (!resolved) {
            return {
                ok: false,
                message: `Couldn't find a "to step" separator in "${moveNodeMatch[1]}". Try: move node <label> to step <n>.`,
            };
        }
        const { sourceLabel, positionText } = resolved;
        const sourceResolution = requireNode(sourceLabel, resolved.source);
        if (!sourceResolution.ok) return sourceResolution;
        const source = sourceResolution.node;
        if (!/^\d+$/.test(positionText)) {
            return {
                ok: false,
                message: `"${positionText}" isn't a valid step number. Try: move node <label> to step <n>.`,
            };
        }
        const targetPosition = Number(positionText);
        const stepCount = architecture.nodes.length;
        if (targetPosition < 1 || targetPosition > stepCount) {
            return {
                ok: false,
                message: `Step ${targetPosition} is out of range (architecture has ${stepCount} step${stepCount === 1 ? "" : "s"}).`,
            };
        }
        const currentIndex = architecture.nodes.findIndex(
            (n) => n.id === source.id,
        );
        const targetIndex = targetPosition - 1;
        if (targetIndex === currentIndex) {
            return {
                ok: false,
                message: `"${source.data.label}" is already step ${targetPosition}.`,
            };
        }
        const withoutNode = architecture.nodes.filter(
            (n) => n.id !== source.id,
        );
        // Re-lays out every node's x to match its new step order
        const reorderedNodes = [
            ...withoutNode.slice(0, targetIndex),
            source,
            ...withoutNode.slice(targetIndex),
        ].map((node, index) => ({
            ...node,
            position: { ...node.position, x: index * NODE_X_SPACING },
        }));
        return {
            ok: true,
            architecture: { ...architecture, nodes: reorderedNodes },
            message: `Moved "${source.data.label}" to step ${targetPosition}.`,
        };
    }

    return {
        ok: false,
        message: `Unrecognized command: "${trimmed}".\n\nTry:\n${UNRECOGNIZED_COMMAND_USAGE}\n\nType "help" for details.`,
    };
}

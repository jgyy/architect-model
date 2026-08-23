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
    matchFirst,
    normalizeLabel,
} from "@/lib/node-reference";
import { COMMAND_USAGE } from "@/lib/supported-commands";
import type {
    Architecture,
    ArchitectureEdge,
    ArchitectureNode,
} from "@/types/architecture";

// One usage line per row instead of a semicolon-joined run-on sentence, so
// it stays scannable when it wraps inside the console's 80-column width.
const UNRECOGNIZED_COMMAND_USAGE = COMMAND_USAGE.map(
    (usage) => `  ${usage}`,
).join("\n");

export type CommandResult =
    | {
          ok: true;
          architecture: Architecture;
          message: string;
      }
    | { ok: false; message: string };

// callers always pass a normalizeLabel()'d string
function isBlankLabel(label: string): boolean {
    return label.length === 0;
}

function slugify(label: string): string {
    return label
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/(^-|-$)/g, "");
}

function uniqueNodeId(slug: string, nodeIndex: NodeIndex): string {
    let id = `node-${slug}`;
    let suffix = 2;
    while (nodeIndex.ids.has(id)) {
        id = `node-${slug}-${suffix}`;
        suffix += 1;
    }
    return id;
}

// null = no match, array = ambiguous (multiple substring matches, no exact one)
function foldLabel(label: string): string {
    return label.normalize("NFC").toLowerCase();
}

// A label->node lookup (plus the id set uniqueNodeId needs) and edge lookups
// by source/target pair and by each endpoint alone, built once by the caller
// and reused across commands instead of rescanning every node/edge on every
// command - the exact-match, id-collision, and connectivity checks below
// would otherwise be O(nodes)/O(edges) each, making a run of many commands
// quadratic. outgoingBySource/incomingByTarget hold at most one edge per key
// because connect() below caps every node at one outgoing and one incoming
// edge, so a Map (not a multimap) is the right shape.
export type NodeIndex = {
    byLabel: Map<string, ArchitectureNode>;
    ids: Set<string>;
    edgesBySourceTarget: Map<string, ArchitectureEdge>;
    outgoingBySource: Map<string, ArchitectureEdge>;
    incomingByTarget: Map<string, ArchitectureEdge>;
};

function edgeKey(sourceId: string, targetId: string): string {
    return `${sourceId}::${targetId}`;
}

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
    };
}

// Would connecting source->target close a loop? Walks forward from target
// along the (at most one) outgoing edge per node, since connect() below
// keeps fan-out capped at 1 - a single linear walk, no branching search.
// The visited set is a defensive guard against legacy data that predates
// this constraint and might already contain a cycle.
function wouldCreateCycle(
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

function findNodeOrAmbiguity(
    label: string,
    architecture: Architecture,
    nodeIndex: NodeIndex,
): ArchitectureNode | ArchitectureNode[] | null {
    const needle = normalizeLabel(label).toLowerCase();
    if (needle.length === 0) return null;
    const exact = nodeIndex.byLabel.get(needle);
    if (exact) return exact;
    // no fast path for a substring match - this only runs for a
    // non-exact/partial reference, which is inherently rarer
    const matches = architecture.nodes.filter((node) =>
        foldLabel(node.data.label).includes(needle),
    );
    if (matches.length === 0) return null;
    if (matches.length === 1) return matches[0];
    return matches;
}

const AMBIGUOUS_MATCHES_SHOWN = 20;

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

// "<A> <sep> <B>" is ambiguous when a label itself contains a separator word
function splitConnectionArgs(
    rest: string,
    separators: string[],
): { sourceLabel: string; targetLabel: string }[] {
    const lower = rest.toLowerCase();
    const splits: { sourceLabel: string; targetLabel: string }[] = [];
    for (const separator of separators) {
        let from = 0;
        while (true) {
            const idx = lower.indexOf(separator, from);
            if (idx === -1) break;
            splits.push({
                sourceLabel: rest.slice(0, idx).trim(),
                targetLabel: rest.slice(idx + separator.length).trim(),
            });
            from = idx + 1;
        }
    }
    return splits;
}

type EndpointMatch = ArchitectureNode | ArchitectureNode[] | null;

type ResolvedEndpoints = {
    sourceLabel: string;
    targetLabel: string;
    source: EndpointMatch;
    target: EndpointMatch;
};

function isSingleNode(match: EndpointMatch): match is ArchitectureNode {
    return match !== null && !Array.isArray(match);
}

// True when sourceLabel is the resolved node's whole label, not merely a
// substring match of it - lets resolveRenameArgs/resolveMoveNodeArgs prefer
// this split over an earlier " to "/" to step " occurrence that happens to
// fall inside the node's own label (e.g. renaming "Point to Point Link")
function isExactLabelMatch(sourceLabel: string, match: EndpointMatch): boolean {
    return (
        isSingleNode(match) &&
        foldLabel(normalizeLabel(sourceLabel)) === foldLabel(match.data.label)
    );
}

function resolveConnectionEndpoints(
    rest: string,
    architecture: Architecture,
    nodeIndex: NodeIndex,
    separators: string[],
): ResolvedEndpoints | null {
    const splits = splitConnectionArgs(rest, separators);
    if (splits.length === 0) return null;

    const resolved = splits.map((split) => ({
        ...split,
        source: findNodeOrAmbiguity(split.sourceLabel, architecture, nodeIndex),
        target: findNodeOrAmbiguity(split.targetLabel, architecture, nodeIndex),
    }));

    return (
        resolved.find(
            (r) => isSingleNode(r.source) && isSingleNode(r.target),
        ) ?? resolved[0]
    );
}

type ResolvedRenameArgs = {
    sourceLabel: string;
    newLabel: string;
    source: EndpointMatch;
};

// A trailing " to " with nothing after it (a blank new label) never
// survives as a real split: parseCommand's own leading trim() - and, for a
// canvas-synthesized command, runCommand's trim() before that - strips the
// separator's trailing space first, so by the time splitConnectionArgs runs
// the string just ends in "...to" with no space left to match against.
// Recognize that case explicitly instead of misreporting it as a missing
// separator, so it reaches the real "label cannot be blank" rejection.
function resolveTrailingSeparatorWithBlankTarget(
    rest: string,
    architecture: Architecture,
    nodeIndex: NodeIndex,
    separators: string[],
): ResolvedRenameArgs | null {
    const lower = rest.toLowerCase();
    const trimmedSeparator = separators.find((separator) =>
        lower.endsWith(separator.trimEnd()),
    );
    if (!trimmedSeparator) return null;
    const sourceLabel = rest
        .slice(0, rest.length - trimmedSeparator.trimEnd().length)
        .trim();
    return {
        sourceLabel,
        newLabel: "",
        source: findNodeOrAmbiguity(sourceLabel, architecture, nodeIndex),
    };
}

// Unlike resolveConnectionEndpoints, only the left side is a node reference
function resolveRenameArgs(
    rest: string,
    architecture: Architecture,
    nodeIndex: NodeIndex,
    separators: string[],
): ResolvedRenameArgs | null {
    const splits = splitConnectionArgs(rest, separators);
    const trailingBlank = resolveTrailingSeparatorWithBlankTarget(
        rest,
        architecture,
        nodeIndex,
        separators,
    );
    if (splits.length === 0) return trailingBlank;

    const resolved = splits.map((split) => ({
        sourceLabel: split.sourceLabel,
        newLabel: split.targetLabel,
        source: findNodeOrAmbiguity(split.sourceLabel, architecture, nodeIndex),
    }));

    return (
        resolved.find((r) => isExactLabelMatch(r.sourceLabel, r.source)) ??
        // A real (non-blank-target) split only ever wins here by matching a
        // node as a mere substring of its label - if the label's own
        // trailing " to " is the whole story (a blank rename attempt on a
        // node whose label happens to contain a separator word), that's a
        // truer read than treating the substring hit as the new label
        (trailingBlank &&
        isExactLabelMatch(trailingBlank.sourceLabel, trailingBlank.source)
            ? trailingBlank
            : null) ??
        resolved.find((r) => isSingleNode(r.source)) ??
        resolved[0]
    );
}

type ResolvedMoveArgs = {
    sourceLabel: string;
    positionText: string;
    source: EndpointMatch;
};

// Unlike resolveConnectionEndpoints, the right side is a step number, not a node reference
function resolveMoveNodeArgs(
    rest: string,
    architecture: Architecture,
    nodeIndex: NodeIndex,
    separators: string[],
): ResolvedMoveArgs | null {
    const splits = splitConnectionArgs(rest, separators);
    if (splits.length === 0) return null;

    const resolved = splits.map((split) => ({
        sourceLabel: split.sourceLabel,
        positionText: split.targetLabel.trim(),
        source: findNodeOrAmbiguity(split.sourceLabel, architecture, nodeIndex),
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

export type ParseCommandOptions = {
    // Where a canvas-created node lands; typed "add node" ignores this and
    // uses the default formula below
    position?: { x: number; y: number };
};

// connect/remove-edge/rename-node parsing tries every occurrence of every
// separator word in the argument; an unbounded input turns that into O(n^2)
// work, so absurdly long input (e.g. a large pasted block) is rejected outright
const MAX_COMMAND_LENGTH = 500;

// Horizontal gap between simulation steps, left to right - shared by a new
// node's default position and by move-node's re-layout after a reorder
const NODE_X_SPACING = 250;

export function parseCommand(
    input: string,
    architecture: Architecture,
    options: ParseCommandOptions = {},
    nodeIndex: NodeIndex = buildNodeIndex(
        architecture.nodes,
        architecture.edges,
    ),
): CommandResult {
    const trimmed = input.trim();

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
        const duplicate = findNodeByExactLabel(label, nodeIndex);
        if (duplicate) {
            return {
                ok: false,
                message: `A node named "${duplicate.data.label}" already exists.`,
            };
        }
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
            architecture,
            nodeIndex,
            CONNECT_SEPARATORS,
        );
        if (!resolved) {
            return {
                ok: false,
                message: `Couldn't find a "to" or "and" separator in "${connectMatch[1]}". Try: connect <A> to <B>.`,
            };
        }
        const { source, target, sourceLabel, targetLabel } = resolved;
        if (source === null) {
            return { ok: false, message: `No node named "${sourceLabel}".` };
        }
        if (Array.isArray(source)) {
            return {
                ok: false,
                message: ambiguousLabelMessage(sourceLabel, source),
            };
        }
        if (target === null) {
            return { ok: false, message: `No node named "${targetLabel}".` };
        }
        if (Array.isArray(target)) {
            return {
                ok: false,
                message: ambiguousLabelMessage(targetLabel, target),
            };
        }
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
        const resolved = findNodeOrAmbiguity(label, architecture, nodeIndex);
        if (resolved === null) {
            return { ok: false, message: `No node named "${label}".` };
        }
        if (Array.isArray(resolved)) {
            return {
                ok: false,
                message: ambiguousLabelMessage(label, resolved),
            };
        }
        const node = resolved;
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
            architecture,
            nodeIndex,
            DISCONNECT_SEPARATORS,
        );
        if (!resolved) {
            return {
                ok: false,
                message: `Couldn't find a "to"/"from"/"and" separator in "${removeEdgeMatch[1]}". Try: remove edge <A> to <B>.`,
            };
        }
        const { source, target, sourceLabel, targetLabel } = resolved;
        if (source === null) {
            return { ok: false, message: `No node named "${sourceLabel}".` };
        }
        if (Array.isArray(source)) {
            return {
                ok: false,
                message: ambiguousLabelMessage(sourceLabel, source),
            };
        }
        if (target === null) {
            return { ok: false, message: `No node named "${targetLabel}".` };
        }
        if (Array.isArray(target)) {
            return {
                ok: false,
                message: ambiguousLabelMessage(targetLabel, target),
            };
        }
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
            architecture,
            nodeIndex,
            RENAME_SEPARATORS,
        );
        if (!resolved) {
            return {
                ok: false,
                message: `Couldn't find a "to" separator in "${renameNodeMatch[1]}". Try: rename node <A> to <B>.`,
            };
        }
        const { source, sourceLabel, newLabel } = resolved;
        if (source === null) {
            return { ok: false, message: `No node named "${sourceLabel}".` };
        }
        if (Array.isArray(source)) {
            return {
                ok: false,
                message: ambiguousLabelMessage(sourceLabel, source),
            };
        }
        const normalizedNewLabel = normalizeLabel(newLabel);
        if (isBlankLabel(normalizedNewLabel)) {
            return { ok: false, message: "A node label cannot be blank." };
        }
        if (foldLabel(normalizedNewLabel) === foldLabel(source.data.label)) {
            return {
                ok: false,
                message: `"${source.data.label}" is already named that.`,
            };
        }
        const duplicate = findNodeByExactLabel(normalizedNewLabel, nodeIndex);
        if (duplicate) {
            return {
                ok: false,
                message: `A node named "${duplicate.data.label}" already exists.`,
            };
        }
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
            architecture,
            nodeIndex,
            MOVE_NODE_SEPARATORS,
        );
        if (!resolved) {
            return {
                ok: false,
                message: `Couldn't find a "to step" separator in "${moveNodeMatch[1]}". Try: move node <label> to step <n>.`,
            };
        }
        const { source, sourceLabel, positionText } = resolved;
        if (source === null) {
            return { ok: false, message: `No node named "${sourceLabel}".` };
        }
        if (Array.isArray(source)) {
            return {
                ok: false,
                message: ambiguousLabelMessage(sourceLabel, source),
            };
        }
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
        // Re-lays out every node's x to match its new step order (y is left
        // alone, since only left-to-right position conveys step order here)
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

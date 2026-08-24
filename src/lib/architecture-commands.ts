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
    foldLabel,
    matchFirst,
    normalizeLabel,
    stripInvisibleChars,
} from "@/lib/node-reference";
import {
    buildNodeIndex,
    edgeKey,
    wouldCreateCycle,
    type NodeIndex,
} from "@/lib/node-index";
import {
    MAX_LABEL_LENGTH,
    duplicateLabelError,
    findNodeOrAmbiguity,
    isBlankLabel,
    isTooLongLabel,
    requireNode,
    resolveConnectionEndpoints,
    resolveMoveNodeArgs,
    resolveRenameArgs,
    slugify,
    uniqueNodeId,
    type CommandResult,
} from "@/lib/command-resolution";
import { COMMAND_USAGE } from "@/lib/supported-commands";
import type { Architecture, ArchitectureNode } from "@/types/architecture";

export {
    findNodesBySubstring,
    buildNodeIndex,
    wouldCreateCycle,
    type NodeIndex,
} from "@/lib/node-index";
export {
    slugify,
    uniqueNodeId,
    MAX_LABEL_LENGTH,
    type CommandResult,
} from "@/lib/command-resolution";

// One usage line per row instead of a semicolon-joined run-on sentence
const UNRECOGNIZED_COMMAND_USAGE = COMMAND_USAGE.map(
    (usage) => `  ${usage}`,
).join("\n");

const ADD_NODE_PATTERNS = [
    /^add node(?:\s+(.*))?$/i,
    /^create node(?:\s+(.*))?$/i,
    /^new node(?:\s+(.*))?$/i,
    /^add a node called(?:\s+(.*))?$/i,
];

/** Extra input to {@link parseCommand} beyond the text; e.g. a canvas drop position. */
export type ParseCommandOptions = {
    /** Where a canvas-created node lands; a typed "add node" ignores this. */
    position?: { x: number; y: number };
};

const MAX_COMMAND_LENGTH = 500;

/**
 * Horizontal pixel gap between steps; re-applied to `x` after `move node` reorders the
 * chain (trace order = node array order, no separate structure).
 */
export const NODE_X_SPACING = 250;

/**
 * Parses one command line into the resulting architecture, if recognized. Fixed per-verb
 * regexes (not NLP/an LLM) for the six verbs; enforces invariants like no cycles (see
 * {@link wouldCreateCycle}) and returns a message on failure instead of throwing.
 * @param input - command text
 * @param architecture - architecture to apply to
 * @param options - see {@link ParseCommandOptions}
 * @param nodeIndex - prebuilt index; omit to build fresh
 * @returns resulting {@link CommandResult}
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

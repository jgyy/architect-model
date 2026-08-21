import {
    ADD_STEP_PATTERNS,
    CONNECT_PATTERNS,
    CONNECT_SEPARATORS,
    DISCONNECT_SEPARATORS,
    INSERT_STEP_PATTERNS,
    REMOVE_EDGE_PATTERNS,
    REMOVE_NODE_PATTERNS,
    matchFirst,
    normalizeLabel,
} from "@/lib/node-reference";
import type { Architecture, ArchitectureNode } from "@/types/architecture";

export type NodeSuggestion = {
    // character offsets into the raw input string spanning the argument
    replaceFrom: number;
    replaceTo: number;
    matches: ArchitectureNode[];
};

const DEFAULT_LIMIT = 8;

function rankMatches(
    partial: string,
    nodes: ArchitectureNode[],
    limit: number,
): ArchitectureNode[] {
    const needle = normalizeLabel(partial).toLowerCase();
    return nodes
        .map((node) => {
            const label = node.data.label.toLowerCase();
            const rank = label === needle ? 0 : label.startsWith(needle) ? 1 : label.includes(needle) ? 2 : -1;
            return { node, rank };
        })
        .filter((entry) => entry.rank >= 0)
        .sort(
            (a, b) =>
                a.rank - b.rank ||
                a.node.data.label.localeCompare(b.node.data.label),
        )
        .slice(0, limit)
        .map((entry) => entry.node);
}

// every pattern in node-reference.ts captures its argument as a suffix
function singleSlotSuggestion(
    input: string,
    rest: string | undefined,
    architecture: Architecture,
    limit: number,
): NodeSuggestion {
    const partial = rest ?? "";
    return {
        replaceFrom: input.length - partial.length,
        replaceTo: input.length,
        matches: rankMatches(partial, architecture.nodes, limit),
    };
}

function lastSeparatorSplit(
    rest: string,
    separators: string[],
): { index: number; length: number } | null {
    const lower = rest.toLowerCase();
    let best: { index: number; length: number } | null = null;
    for (const separator of separators) {
        const idx = lower.lastIndexOf(separator);
        if (idx !== -1 && (best === null || idx > best.index)) {
            best = { index: idx, length: separator.length };
        }
    }
    return best;
}

function twoSlotSuggestion(
    input: string,
    rest: string,
    separators: string[],
    architecture: Architecture,
    limit: number,
    cursor: number,
): NodeSuggestion {
    const restStart = input.length - rest.length;
    const split = lastSeparatorSplit(rest, separators);
    if (!split) {
        return {
            replaceFrom: restStart,
            replaceTo: input.length,
            matches: rankMatches(rest, architecture.nodes, limit),
        };
    }

    // cursor at/before the separator: still editing the first argument
    const separatorStart = restStart + split.index;
    const separatorEnd = separatorStart + split.length;
    if (cursor <= separatorStart) {
        return {
            replaceFrom: restStart,
            replaceTo: separatorStart,
            matches: rankMatches(
                input.slice(restStart, separatorStart),
                architecture.nodes,
                limit,
            ),
        };
    }

    return {
        replaceFrom: separatorEnd,
        replaceTo: input.length,
        matches: rankMatches(input.slice(separatorEnd), architecture.nodes, limit),
    };
}

// Live-typing completion hint for the node-reference argument(s) of a command
export function suggestNodeReference(
    input: string,
    architecture: Architecture,
    cursor: number = input.length,
    limit: number = DEFAULT_LIMIT,
): NodeSuggestion | null {
    const connectMatch = matchFirst(CONNECT_PATTERNS, input);
    if (connectMatch) {
        return twoSlotSuggestion(
            input,
            connectMatch[1],
            CONNECT_SEPARATORS,
            architecture,
            limit,
            cursor,
        );
    }

    const removeEdgeMatch = matchFirst(REMOVE_EDGE_PATTERNS, input);
    if (removeEdgeMatch) {
        return twoSlotSuggestion(
            input,
            removeEdgeMatch[1],
            DISCONNECT_SEPARATORS,
            architecture,
            limit,
            cursor,
        );
    }

    const removeNodeMatch = matchFirst(REMOVE_NODE_PATTERNS, input);
    if (removeNodeMatch) {
        return singleSlotSuggestion(
            input,
            removeNodeMatch[1],
            architecture,
            limit,
        );
    }

    const addStepMatch = matchFirst(ADD_STEP_PATTERNS, input);
    if (addStepMatch) {
        return singleSlotSuggestion(input, addStepMatch[1], architecture, limit);
    }

    const insertStepMatch = matchFirst(INSERT_STEP_PATTERNS, input);
    if (insertStepMatch) {
        return singleSlotSuggestion(
            input,
            insertStepMatch[2],
            architecture,
            limit,
        );
    }

    return null;
}

// Splices a chosen node's label into the input at the suggestion's span
export function applyNodeSuggestion(
    input: string,
    suggestion: NodeSuggestion,
    node: ArchitectureNode,
): { value: string; cursor: number } {
    const before = input.slice(0, suggestion.replaceFrom);
    const after = input.slice(suggestion.replaceTo);
    const needsLeadingSpace = before.length > 0 && !/\s$/.test(before);
    const insertion = `${needsLeadingSpace ? " " : ""}${node.data.label} `;
    const value = before + insertion + after;
    return { value, cursor: (before + insertion).length };
}

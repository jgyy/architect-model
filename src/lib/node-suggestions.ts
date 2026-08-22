import {
    CONNECT_PATTERNS,
    CONNECT_SEPARATORS,
    DISCONNECT_SEPARATORS,
    REMOVE_EDGE_PATTERNS,
    REMOVE_NODE_PATTERNS,
    RENAME_NODE_PATTERNS,
    RENAME_SEPARATORS,
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
            const label = node.data.label.normalize("NFC").toLowerCase();
            const rank =
                label === needle
                    ? 0
                    : label.startsWith(needle)
                      ? 1
                      : label.includes(needle)
                        ? 2
                        : -1;
            return { node, rank };
        })
        .filter((entry) => entry.rank >= 0)
        .sort(
            (a, b) =>
                a.rank - b.rank ||
                a.node.data.label.localeCompare(b.node.data.label),
        )
        .slice(0, Math.max(0, limit))
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

function buildLabelSet(architecture: Architecture): Set<string> {
    return new Set(
        architecture.nodes.map((node) =>
            node.data.label.normalize("NFC").toLowerCase(),
        ),
    );
}

function isCompleteNodeLabel(text: string, labelSet: Set<string>): boolean {
    const needle = normalizeLabel(text).toLowerCase();
    if (needle.length === 0) return false;
    return labelSet.has(needle);
}

// every occurrence of every separator word, left to right within each word
function candidateSeparatorSplits(
    rest: string,
    separators: string[],
): { index: number; length: number }[] {
    const lower = rest.toLowerCase();
    const splits: { index: number; length: number }[] = [];
    for (const separator of separators) {
        let from = 0;
        while (true) {
            const idx = lower.indexOf(separator, from);
            if (idx === -1) break;
            splits.push({ index: idx, length: separator.length });
            from = idx + 1;
        }
    }
    return splits;
}

// Prefers the split whose non-edited side is a real, complete node label
function bestSeparatorSplit(
    rest: string,
    separators: string[],
    architecture: Architecture,
    cursorInRest: number,
): { index: number; length: number } | null {
    const splits = candidateSeparatorSplits(rest, separators);
    if (splits.length === 0) return null;

    // Built once per call, not once per split
    const labelSet = buildLabelSet(architecture);
    const anchored = splits.find((split) => {
        const cursorInSource = cursorInRest <= split.index;
        const fixedLabel = cursorInSource
            ? rest.slice(split.index + split.length).trim()
            : rest.slice(0, split.index).trim();
        return isCompleteNodeLabel(fixedLabel, labelSet);
    });
    if (anchored) return anchored;

    return splits.reduce((best, split) =>
        split.index > best.index ? split : best,
    );
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
    const split = bestSeparatorSplit(
        rest,
        separators,
        architecture,
        cursor - restStart,
    );
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
        matches: rankMatches(
            input.slice(separatorEnd),
            architecture.nodes,
            limit,
        ),
    };
}

// "rename node <A> to <B>" has only one node reference (A) - B is a new
function renameNodeSuggestion(
    input: string,
    rest: string,
    separators: string[],
    architecture: Architecture,
    limit: number,
    cursor: number,
): NodeSuggestion | null {
    const restStart = input.length - rest.length;
    const split = bestSeparatorSplit(
        rest,
        separators,
        architecture,
        cursor - restStart,
    );
    if (!split) {
        return singleSlotSuggestion(input, rest, architecture, limit);
    }

    const separatorStart = restStart + split.index;
    if (cursor > separatorStart) return null;
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

    const renameNodeMatch = matchFirst(RENAME_NODE_PATTERNS, input);
    if (renameNodeMatch) {
        return renameNodeSuggestion(
            input,
            renameNodeMatch[1],
            RENAME_SEPARATORS,
            architecture,
            limit,
            cursor,
        );
    }

    return null;
}

// True when the argument span is already an exact
export function suggestionIsCompleteMatch(
    input: string,
    suggestion: NodeSuggestion,
): boolean {
    const typed = normalizeLabel(
        input.slice(suggestion.replaceFrom, suggestion.replaceTo),
    ).toLowerCase();
    if (typed.length === 0) return false;
    return suggestion.matches.some(
        (match) => match.data.label.toLowerCase() === typed,
    );
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

import {
    buildNodeIndex,
    findNodesBySubstring,
    type NodeIndex,
} from "@/lib/architecture-commands";
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
    matchFirst,
    normalizeLabel,
} from "@/lib/node-reference";
import type { Architecture, ArchitectureNode } from "@/types/architecture";

/** Autocomplete suggestion: input span to replace plus ranked candidate nodes. */
export type NodeSuggestion = {
    /** Start offset (char index) of the argument span to replace. */
    replaceFrom: number;
    /** End offset (char index) of the argument span to replace. */
    replaceTo: number;
    /** Candidate nodes, ranked best match first. */
    matches: ArchitectureNode[];
};

const DEFAULT_LIMIT = 8;

/**
 * Ranks by exact/prefix/substring match, ties alphabetical; empty partial returns all nodes. Substring search is O(needle length) via suffix trie, not O(nodes).
 * @param partial - Typed text.
 * @returns Ranked matches, capped at `limit`.
 */
function rankMatches(
    partial: string,
    nodeIndex: NodeIndex,
    limit: number,
): ArchitectureNode[] {
    const needle = normalizeLabel(partial).toLowerCase();
    if (needle.length === 0) {
        return Array.from(nodeIndex.byLabel.values())
            .sort((a, b) => a.data.label.localeCompare(b.data.label))
            .slice(0, Math.max(0, limit));
    }

    // findNodesBySubstring costs O(needle length), not O(nodes)
    return findNodesBySubstring(nodeIndex, needle)
        .map((node) => {
            const label = node.data.label.normalize("NFC").toLowerCase();
            const rank =
                label === needle ? 0 : label.startsWith(needle) ? 1 : 2;
            return { node, rank };
        })
        .sort(
            (a, b) =>
                a.rank - b.rank ||
                a.node.data.label.localeCompare(b.node.data.label),
        )
        .slice(0, Math.max(0, limit))
        .map((entry) => entry.node);
}

/**
 * Suggestion for a single-node command (e.g. "remove node <A>"); argument spans to end of input. Null if cursor is before that span.
 * @param rest - Captured argument, if any.
 * @param cursor - Caret offset.
 * @returns Suggestion, or null outside the span.
 */
function singleSlotSuggestion(
    input: string,
    rest: string | undefined,
    nodeIndex: NodeIndex,
    limit: number,
    cursor: number,
): NodeSuggestion | null {
    const partial = rest ?? "";
    const replaceFrom = input.length - partial.length;
    // The argument always runs to the end of the string
    if (cursor < replaceFrom) return null;
    return {
        replaceFrom,
        replaceTo: input.length,
        matches: rankMatches(partial, nodeIndex, limit),
    };
}

/**
 * True if normalized `text` exactly matches an existing node label (vs. still being typed).
 * @param text - Candidate label.
 * @returns Whether it matches exactly.
 */
function isCompleteNodeLabel(text: string, nodeIndex: NodeIndex): boolean {
    const needle = normalizeLabel(text).toLowerCase();
    if (needle.length === 0) return false;
    return nodeIndex.byLabel.has(needle);
}

/**
 * Picks which separator occurrence splits the two references (a separator like " to " may also appear inside a label). Prefers the occurrence whose non-edited side is a complete node label; else the rightmost.
 * @param rest - Text after the keyword.
 * @param cursorInRest - Cursor position relative to `rest`.
 * @returns Offset/length in `rest`, or null.
 */
function bestSeparatorSplit(
    rest: string,
    separators: string[],
    nodeIndex: NodeIndex,
    cursorInRest: number,
): { index: number; length: number } | null {
    const splits = findSeparatorOccurrences(rest, separators);
    if (splits.length === 0) return null;

    const anchored = splits.find((split) => {
        const cursorInSource = cursorInRest <= split.index;
        const fixedLabel = cursorInSource
            ? rest.slice(split.index + split.length).trim()
            : rest.slice(0, split.index).trim();
        return isCompleteNodeLabel(fixedLabel, nodeIndex);
    });
    if (anchored) return anchored;

    return splits.reduce((best, split) =>
        split.index > best.index ? split : best,
    );
}

/**
 * Suggestion for a two-node command (e.g. "connect <A> to <B>"): completes whichever side the cursor is on; with no separator found, treats the remainder as the first argument.
 * @param rest - Text after the keyword.
 * @param cursor - Caret offset.
 * @returns Suggestion for the cursor's argument.
 */
function twoSlotSuggestion(
    input: string,
    rest: string,
    separators: string[],
    nodeIndex: NodeIndex,
    limit: number,
    cursor: number,
): NodeSuggestion {
    const restStart = input.length - rest.length;
    const split = bestSeparatorSplit(
        rest,
        separators,
        nodeIndex,
        cursor - restStart,
    );
    if (!split) {
        return {
            replaceFrom: restStart,
            replaceTo: input.length,
            matches: rankMatches(rest, nodeIndex, limit),
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
                nodeIndex,
                limit,
            ),
        };
    }

    return {
        replaceFrom: separatorEnd,
        replaceTo: input.length,
        matches: rankMatches(input.slice(separatorEnd), nodeIndex, limit),
    };
}

/**
 * Suggestion for commands where only one side is a node reference - "rename node <A> to <B>" (B is a fresh label) or "move node <A> to step <n>". Completes A; null once past the separator.
 * @param rest - Text after the keyword.
 * @param cursor - Caret offset.
 * @returns Suggestion for the reference argument, or null past it.
 */
function renameNodeSuggestion(
    input: string,
    rest: string,
    separators: string[],
    nodeIndex: NodeIndex,
    limit: number,
    cursor: number,
): NodeSuggestion | null {
    const restStart = input.length - rest.length;
    const split = bestSeparatorSplit(
        rest,
        separators,
        nodeIndex,
        cursor - restStart,
    );
    if (!split) {
        return singleSlotSuggestion(input, rest, nodeIndex, limit, cursor);
    }

    const separatorStart = restStart + split.index;
    if (cursor > separatorStart) return null;
    return {
        replaceFrom: restStart,
        replaceTo: separatorStart,
        matches: rankMatches(
            input.slice(restStart, separatorStart),
            nodeIndex,
            limit,
        ),
    };
}

/**
 * Autocomplete entry point: matches `input` against each command form (connect, remove edge, remove/rename node, move node) and returns the replace-span plus ranked suggestions for the cursor's argument.
 * @param cursor - Defaults to end of input.
 * @param limit - Defaults to DEFAULT_LIMIT.
 * @param nodeIndex - Built from `architecture` if omitted; pass to reuse across calls.
 * @returns Suggestion for the cursor's argument, or null if no form matches.
 */
export function suggestNodeReference(
    input: string,
    architecture: Architecture,
    cursor: number = input.length,
    limit: number = DEFAULT_LIMIT,
    nodeIndex: NodeIndex = buildNodeIndex(
        architecture.nodes,
        architecture.edges,
    ),
): NodeSuggestion | null {
    const connectMatch = matchFirst(CONNECT_PATTERNS, input);
    if (connectMatch) {
        return twoSlotSuggestion(
            input,
            connectMatch[1],
            CONNECT_SEPARATORS,
            nodeIndex,
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
            nodeIndex,
            limit,
            cursor,
        );
    }

    const removeNodeMatch = matchFirst(REMOVE_NODE_PATTERNS, input);
    if (removeNodeMatch) {
        return singleSlotSuggestion(
            input,
            removeNodeMatch[1],
            nodeIndex,
            limit,
            cursor,
        );
    }

    const renameNodeMatch = matchFirst(RENAME_NODE_PATTERNS, input);
    if (renameNodeMatch) {
        return renameNodeSuggestion(
            input,
            renameNodeMatch[1],
            RENAME_SEPARATORS,
            nodeIndex,
            limit,
            cursor,
        );
    }

    // "move node <A> to step <n>" has only one node reference (A)
    const moveNodeMatch = matchFirst(MOVE_NODE_PATTERNS, input);
    if (moveNodeMatch) {
        return renameNodeSuggestion(
            input,
            moveNodeMatch[1],
            MOVE_NODE_SEPARATORS,
            nodeIndex,
            limit,
            cursor,
        );
    }

    return null;
}

/**
 * True if the suggestion's argument span exactly matches one of its candidate nodes - lets the dropdown dismiss once a label is fully typed.
 * @param suggestion - Span and candidates to check.
 * @returns Whether the typed span matches, case-insensitively.
 */
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

/**
 * Splices the node's label into the suggestion's span, padding with a leading space if needed and a trailing space always, so the caret is ready to continue typing.
 * @param suggestion - Span of `input` to replace.
 * @param node - Node to insert.
 * @returns Updated text and caret position after the label.
 */
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

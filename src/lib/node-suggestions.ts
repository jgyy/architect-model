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

/**
 * A pending autocomplete suggestion: the input span a picked node would
 * replace, plus the ranked candidate nodes.
 */
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
 * Ranks nodes for the autocomplete dropdown: exact match, then prefix
 * match, then other substring matches, ties alphabetical. Substring
 * search uses `nodeIndex`'s suffix trie (findNodesBySubstring), costing
 * roughly the needle's length rather than a full scan. Empty partial
 * returns every node, alphabetized.
 *
 * @param partial - Text typed so far.
 * @param nodeIndex - Lookup structure to search.
 * @param limit - Max suggestions to return.
 * @returns Top-ranked matches, capped at `limit`.
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
 * Builds a suggestion for a single-node-reference command, e.g. "remove
 * node <A>". The argument runs from `rest`'s start to the end of input
 * (per node-reference.ts's patterns). Returns null once the cursor is
 * before that span.
 *
 * @param input - Full raw command text.
 * @param rest - Captured argument text (match group), if any.
 * @param nodeIndex - Lookup structure for ranking candidates.
 * @param limit - Max suggestions to return.
 * @param cursor - Caret offset in `input`.
 * @returns Suggestion for the argument span, or null if cursor is outside it.
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
 * Reports whether normalized `text` exactly matches an existing node
 * label (vs. one still being typed).
 *
 * @param text - Candidate label text.
 * @param nodeIndex - Lookup structure to check against.
 * @returns True if `text` matches an existing label exactly.
 */
function isCompleteNodeLabel(text: string, nodeIndex: NodeIndex): boolean {
    const needle = normalizeLabel(text).toLowerCase();
    if (needle.length === 0) return false;
    return nodeIndex.byLabel.has(needle);
}

/**
 * Picks which occurrence of a separator (e.g. " to " in "connect A to
 * B") splits the two references, since it may also appear inside a
 * label. Prefers the occurrence whose non-edited side (`cursorInRest`)
 * is a complete node label; else uses the rightmost.
 *
 * @param rest - Text after the keyword, with both references and separator(s).
 * @param separators - Accepted separator strings (e.g. " to ", " and ").
 * @param nodeIndex - Lookup structure to test candidate labels.
 * @param cursorInRest - Cursor position relative to `rest`.
 * @returns Chosen separator's offset/length in `rest`, or null if none occur.
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
 * Suggestion for a two-node command, e.g. "connect <A> to <B>": finds
 * the separator via bestSeparatorSplit and completes whichever side the
 * cursor is on; with none, treats the remainder as the first argument.
 *
 * @param input - Full raw command text.
 * @param rest - Captured text after the keyword, both node references.
 * @param separators - Separator strings this form accepts.
 * @param nodeIndex - Lookup structure for ranking candidates.
 * @param limit - Max suggestions to return.
 * @param cursor - Caret offset in `input`.
 * @returns Suggestion for whichever argument span the cursor is in.
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
 * Builds a suggestion for commands where only one side is a node
 * reference - "rename node <A> to <B>" (B a fresh label) or "move node
 * <A> to step <n>" (a step number). Completes A while the cursor is
 * there; null once past the separator.
 *
 * @param input - Full raw command text.
 * @param rest - Captured text after the keyword.
 * @param separators - Separator strings this form accepts.
 * @param nodeIndex - Lookup structure for ranking and anchoring the split.
 * @param limit - Max suggestions to return.
 * @param cursor - Caret offset in `input`.
 * @returns Suggestion for the node-reference argument, or null once past it.
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
 * Live-typing completion hint for a command's node-reference argument(s):
 * matches input against each command form (connect/link, remove edge,
 * remove/rename node, move node) and returns the span to replace plus
 * ranked suggestions for the cursor's argument. Entry point for the
 * autocomplete dropdown.
 *
 * @param input - Full raw command text in the input box.
 * @param architecture - Graph (nodes/edges) suggestions are drawn from.
 * @param cursor - Caret offset in `input`; defaults to the end.
 * @param limit - Max suggestions; defaults to DEFAULT_LIMIT.
 * @param nodeIndex - Lookup structure; built from `architecture` if omitted, so callers can reuse one.
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
 * Reports whether a suggestion's argument-span text exactly matches one
 * of its candidate nodes - lets the dropdown dismiss once a valid label
 * is fully typed.
 *
 * @param input - Full raw command text.
 * @param suggestion - Suggestion whose span and matches to check.
 * @returns True if the typed span case-insensitively matches a candidate node.
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
 * Splices a node's label into the suggestion's span, replacing the typed
 * partial, and pads with spaces (leading if needed, trailing always) for
 * a caret ready to continue typing.
 *
 * @param input - Raw command text before the suggestion is applied.
 * @param suggestion - Identifies which span of `input` to replace.
 * @param node - Node whose label is inserted.
 * @returns Updated input text and caret position after the inserted label and its trailing space.
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

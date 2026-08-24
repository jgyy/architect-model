/**
 * Regex fragments and label-normalization helpers shared by the command
 * parser (architecture-commands.ts).
 */

/**
 * Tries each regex in `patterns`, in order, and returns the first match
 * against `text`. Lets callers accept multiple phrasings for one command
 * without looping over the pattern list themselves.
 *
 * @param patterns - candidate regexes, in priority order
 * @param text - input string to match
 * @returns the first match found, or `null` if none matched
 */
export function matchFirst(
    patterns: RegExp[],
    text: string,
): RegExpMatchArray | null {
    for (const pattern of patterns) {
        const match = text.match(pattern);
        if (match) return match;
    }
    return null;
}

/**
 * Matches invisible Unicode characters (zero-width space/non-joiner/joiner,
 * byte-order-mark) that can hide in a pasted label and make
 * visually-identical labels compare unequal.
 */
const INVISIBLE_CHARS_PATTERN = /[\u200B-\u200D\uFEFF]/g;

/**
 * Strips characters that render as nothing but can silently break label
 * comparisons (see {@link INVISIBLE_CHARS_PATTERN}).
 *
 * @param text - raw input to clean
 * @returns `text` with invisible characters removed
 */
export function stripInvisibleChars(text: string): string {
    return text.replace(INVISIBLE_CHARS_PATTERN, "");
}

/**
 * Canonical form of a node label: NFC-normalizes, strips invisible
 * characters, trims, and collapses internal whitespace runs to single
 * spaces.
 *
 * @param label - raw label text
 * @returns the normalized label
 */
export function normalizeLabel(label: string): string {
    return stripInvisibleChars(label.normalize("NFC"))
        .trim()
        .replace(/\s+/g, " ");
}

/**
 * Cheaper than {@link normalizeLabel}: NFC-normalizes and lowercases for
 * case-insensitive comparison, without trimming or collapsing whitespace.
 * Used for fast label lookup keys, e.g. exact-label maps and substring
 * search.
 *
 * @param label - the label to fold
 * @returns the folded label
 */
export function foldLabel(label: string): string {
    return label.normalize("NFC").toLowerCase();
}

/**
 * Finds every position where a separator word occurs in `rest`,
 * case-insensitively, left to right per separator. A node reference may
 * itself contain a separator word (e.g. "Front to Back"), so returning all
 * occurrences lets the caller try each split point instead of assuming the
 * first match is correct.
 *
 * @param rest - unparsed remainder of a command, after its verb
 * @param separators - the separator words to search for, e.g. " to "
 * @returns every occurrence found, as `{ index, length }` pairs into `rest`
 */
export function findSeparatorOccurrences(
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

/**
 * Regex forms for a "connect" command: `connect <rest>` or `link <rest>`.
 * Part of this app's fixed command mini-syntax (matched patterns, not
 * free-form NL) so accepted phrasings stay predictable. `<rest>` still
 * needs splitting into source/target; see {@link CONNECT_SEPARATORS}.
 */
export const CONNECT_PATTERNS = [/^connect (.+)$/i, /^link (.+)$/i];

/**
 * Matches `remove node <rest>` or `delete node <rest>`; captures the node
 * to remove.
 */
export const REMOVE_NODE_PATTERNS = [
    /^remove node (.+)$/i,
    /^delete node (.+)$/i,
];

/**
 * Matches `remove edge <rest>`, `delete edge <rest>`, or `disconnect
 * <rest>`. `<rest>` splits into the edge's two endpoints; see
 * {@link DISCONNECT_SEPARATORS}.
 */
export const REMOVE_EDGE_PATTERNS = [
    /^remove edge (.+)$/i,
    /^delete edge (.+)$/i,
    /^disconnect (.+)$/i,
];

/**
 * Matches `rename node <rest>` or `relabel node <rest>`; `<rest>` splits
 * into the old reference and new label, see {@link RENAME_SEPARATORS}.
 */
export const RENAME_NODE_PATTERNS = [
    /^rename node (.+)$/i,
    /^relabel node (.+)$/i,
];

/**
 * Matches `move node <rest>` or `reorder node <rest>`; `<rest>` splits into
 * the node reference and destination step, see {@link MOVE_NODE_SEPARATORS}.
 */
export const MOVE_NODE_PATTERNS = [/^move node (.+)$/i, /^reorder node (.+)$/i];

/**
 * Words separating source/target node references in a connect command,
 * e.g. "A to B" / "A and B".
 */
export const CONNECT_SEPARATORS = [" to ", " and "];

/**
 * Separators for the two endpoints in a disconnect command: "to", "from",
 * "and".
 */
export const DISCONNECT_SEPARATORS = [" to ", " from ", " and "];

/**
 * Separates a node's old reference from its new label, e.g.
 * "A to New Name".
 */
export const RENAME_SEPARATORS = [" to "];

/**
 * Separates a node reference from its destination step, e.g.
 * "A to step 2".
 */
export const MOVE_NODE_SEPARATORS = [" to step "];

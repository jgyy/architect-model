/** Regex fragments and label-normalization helpers used by the command parser. */

/**
 * First match against `text` from `patterns`, tried in priority order.
 * @param patterns - candidate regexes
 * @param text - input string
 * @returns first match, or `null`
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

/** Invisible Unicode chars (zero-width space/non-joiner/joiner, BOM) that can hide in pasted labels and break equality checks. */
const INVISIBLE_CHARS_PATTERN = /[\u200B-\u200D\uFEFF]/g;

/**
 * Removes invisible chars that can silently break label comparisons ({@link INVISIBLE_CHARS_PATTERN}).
 * @param text - raw input
 * @returns cleaned text
 */
export function stripInvisibleChars(text: string): string {
    return text.replace(INVISIBLE_CHARS_PATTERN, "");
}

/**
 * Canonical label form: NFC-normalize, strip invisible chars, trim, collapse whitespace.
 * @param label - raw label
 * @returns normalized label
 */
export function normalizeLabel(label: string): string {
    return stripInvisibleChars(label.normalize("NFC"))
        .trim()
        .replace(/\s+/g, " ");
}

/**
 * Cheaper than {@link normalizeLabel}: NFC-normalize + lowercase only, for fast lookup keys.
 * @param label - label to fold
 * @returns folded label
 */
export function foldLabel(label: string): string {
    return label.normalize("NFC").toLowerCase();
}

/**
 * All positions of each separator in `rest`, case-insensitive - returns every
 * match since a reference may itself contain the separator (e.g. "Front to
 * Back"), so the caller tries each split point.
 * @param rest - command remainder after its verb
 * @param separators - words to search for, e.g. " to "
 * @returns `{ index, length }` pairs into `rest`
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

/** Matches `connect <rest>` / `link <rest>`; split via {@link CONNECT_SEPARATORS}. */
export const CONNECT_PATTERNS = [/^connect (.+)$/i, /^link (.+)$/i];

/** Matches `remove node <rest>` / `delete node <rest>`. */
export const REMOVE_NODE_PATTERNS = [
    /^remove node (.+)$/i,
    /^delete node (.+)$/i,
];

/** Matches `remove/delete edge <rest>` or `disconnect <rest>`; split via {@link DISCONNECT_SEPARATORS}. */
export const REMOVE_EDGE_PATTERNS = [
    /^remove edge (.+)$/i,
    /^delete edge (.+)$/i,
    /^disconnect (.+)$/i,
];

/** Matches `rename/relabel node <rest>`; split via {@link RENAME_SEPARATORS}. */
export const RENAME_NODE_PATTERNS = [
    /^rename node (.+)$/i,
    /^relabel node (.+)$/i,
];

/** Matches `move/reorder node <rest>`; split via {@link MOVE_NODE_SEPARATORS}. */
export const MOVE_NODE_PATTERNS = [/^move node (.+)$/i, /^reorder node (.+)$/i];

/** Separators for source/target in a connect command, e.g. "A to B" / "A and B". */
export const CONNECT_SEPARATORS = [" to ", " and "];

/** Separators for the two endpoints in a disconnect command: "to", "from", "and". */
export const DISCONNECT_SEPARATORS = [" to ", " from ", " and "];

/** Separates old reference from new label, e.g. "A to New Name". */
export const RENAME_SEPARATORS = [" to "];

/** Separates node reference from destination step, e.g. "A to step 2". */
export const MOVE_NODE_SEPARATORS = [" to step "];

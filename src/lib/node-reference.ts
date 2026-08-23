// Regex fragments and matching primitives shared between the command parser
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

// zero-width space/non-joiner/joiner and byte-order-mark
const INVISIBLE_CHARS_PATTERN = /[\u200B-\u200D\uFEFF]/g;

// Strips characters that render as nothing but can silently break an exact
// substring match - a command keyword, a separator token ("connect A to\u200B B"
// with a zero-width space inside "to"), or a label lookup.
export function stripInvisibleChars(text: string): string {
    return text.replace(INVISIBLE_CHARS_PATTERN, "");
}

// Collapses runs of internal whitespace (not just leading/trailing)
export function normalizeLabel(label: string): string {
    return stripInvisibleChars(label.normalize("NFC"))
        .trim()
        .replace(/\s+/g, " ");
}

// A cheaper normalization than normalizeLabel: just enough to compare two
// already-trimmed labels for equality regardless of case/composition.
export function foldLabel(label: string): string {
    return label.normalize("NFC").toLowerCase();
}

// Every occurrence of every separator word, left to right within each word
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

export const CONNECT_PATTERNS = [/^connect (.+)$/i, /^link (.+)$/i];

export const REMOVE_NODE_PATTERNS = [
    /^remove node (.+)$/i,
    /^delete node (.+)$/i,
];

export const REMOVE_EDGE_PATTERNS = [
    /^remove edge (.+)$/i,
    /^delete edge (.+)$/i,
    /^disconnect (.+)$/i,
];

export const RENAME_NODE_PATTERNS = [
    /^rename node (.+)$/i,
    /^relabel node (.+)$/i,
];

export const MOVE_NODE_PATTERNS = [/^move node (.+)$/i, /^reorder node (.+)$/i];

export const CONNECT_SEPARATORS = [" to ", " and "];
export const DISCONNECT_SEPARATORS = [" to ", " from ", " and "];
export const RENAME_SEPARATORS = [" to "];
export const MOVE_NODE_SEPARATORS = [" to step "];

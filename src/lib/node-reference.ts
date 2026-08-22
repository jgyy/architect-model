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

// Collapses runs of internal whitespace (not just leading/trailing), strips
// invisible formatting characters, and folds Unicode composition to NFC —
// so two labels that render identically (e.g. a trailing zero-width space,
// or an accented character typed as base+combining-mark vs. precomposed)
// compare equal everywhere this feeds into label matching.
export function normalizeLabel(label: string): string {
    return label
        .normalize("NFC")
        .replace(INVISIBLE_CHARS_PATTERN, "")
        .trim()
        .replace(/\s+/g, " ");
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

export const CONNECT_SEPARATORS = [" to ", " and "];
export const DISCONNECT_SEPARATORS = [" to ", " from ", " and "];

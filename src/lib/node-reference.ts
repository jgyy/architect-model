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

// collapses runs of internal whitespace (not just leading/trailing)
export function normalizeLabel(label: string): string {
    return label.trim().replace(/\s+/g, " ");
}

export const CONNECT_PATTERNS = [/^connect (.+)$/i, /^link (.+)$/i];

export const REMOVE_NODE_PATTERNS = [/^remove node (.+)$/i, /^delete node (.+)$/i];

export const REMOVE_EDGE_PATTERNS = [
    /^remove edge (.+)$/i,
    /^delete edge (.+)$/i,
    /^disconnect (.+)$/i,
];

export const ADD_STEP_PATTERNS = [/^add step(?:\s+(.*))?$/i];

export const INSERT_STEP_PATTERNS = [/^insert step (\d+)(?:\s+(.*))?$/i];

export const CONNECT_SEPARATORS = [" to ", " and "];
export const DISCONNECT_SEPARATORS = [" to ", " from ", " and "];

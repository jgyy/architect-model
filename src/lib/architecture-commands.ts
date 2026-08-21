import type { Architecture, ArchitectureNode } from "@/types/architecture";

export type CommandResult =
    | { ok: true; architecture: Architecture; message: string }
    | { ok: false; message: string };

// zero-width space/non-joiner/joiner and byte-order-mark: characters that
// survive .trim() but render as nothing.
const INVISIBLE_CHARS_PATTERN = /[\u200B-\u200D\uFEFF]/g;

// collapses runs of internal whitespace (not just leading/trailing) so labels
// that only differ by extra spaces ("Web  Server" vs "Web Server") are
// treated as the same label everywhere — on storage and on lookup.
function normalizeLabel(label: string): string {
    return label.trim().replace(/\s+/g, " ");
}

// distinct from a plain blank check: strips invisible characters (zero-width
// space, etc.) that survive .trim() but render as nothing, so a label made
// up only of those doesn't slip past the blank-label validation.
function isBlankLabel(label: string): boolean {
    return label.replace(INVISIBLE_CHARS_PATTERN, "").trim().length === 0;
}

function slugify(label: string): string {
    return label
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/(^-|-$)/g, "");
}

function uniqueNodeId(slug: string, architecture: Architecture): string {
    let id = `node-${slug}`;
    let suffix = 2;
    while (architecture.nodes.some((node) => node.id === id)) {
        id = `node-${slug}-${suffix}`;
        suffix += 1;
    }
    return id;
}

// case-insensitive: prefer an exact label match, fall back to substring
function findNodeByLabel(
    label: string,
    architecture: Architecture,
): ArchitectureNode | undefined {
    const needle = normalizeLabel(label).toLowerCase();
    const exact = architecture.nodes.find(
        (node) => node.data.label.toLowerCase() === needle,
    );
    return (
        exact ??
        architecture.nodes.find((node) =>
            node.data.label.toLowerCase().includes(needle),
        )
    );
}

function findNodeByExactLabel(
    label: string,
    architecture: Architecture,
): ArchitectureNode | undefined {
    const needle = normalizeLabel(label).toLowerCase();
    return architecture.nodes.find(
        (node) => node.data.label.toLowerCase() === needle,
    );
}

function matchFirst(patterns: RegExp[], text: string): RegExpMatchArray | null {
    for (const pattern of patterns) {
        const match = text.match(pattern);
        if (match) return match;
    }
    return null;
}

// "<A> <sep> <B>" is ambiguous when a label itself contains a separator word
// (e.g. "Point to Point Link"): try every split point across every separator
// and prefer the one where both sides resolve to real nodes, falling back to
// the first split (in separator-list order) for error reporting.
function splitConnectionArgs(
    rest: string,
    separators: string[],
): { sourceLabel: string; targetLabel: string }[] {
    const lower = rest.toLowerCase();
    const splits: { sourceLabel: string; targetLabel: string }[] = [];
    for (const separator of separators) {
        let from = 0;
        while (true) {
            const idx = lower.indexOf(separator, from);
            if (idx === -1) break;
            splits.push({
                sourceLabel: rest.slice(0, idx).trim(),
                targetLabel: rest.slice(idx + separator.length).trim(),
            });
            from = idx + 1;
        }
    }
    return splits;
}

type ResolvedEndpoints = {
    sourceLabel: string;
    targetLabel: string;
    source: ArchitectureNode | undefined;
    target: ArchitectureNode | undefined;
};

const CONNECT_SEPARATORS = [" to ", " and "];
const DISCONNECT_SEPARATORS = [" to ", " from ", " and "];

function resolveConnectionEndpoints(
    rest: string,
    architecture: Architecture,
    separators: string[],
): ResolvedEndpoints | null {
    const splits = splitConnectionArgs(rest, separators);
    if (splits.length === 0) return null;

    const resolved = splits.map((split) => ({
        ...split,
        source: findNodeByLabel(split.sourceLabel, architecture),
        target: findNodeByLabel(split.targetLabel, architecture),
    }));

    return resolved.find((r) => r.source && r.target) ?? resolved[0];
}

const ADD_NODE_PATTERNS = [
    /^add node(?:\s+(.*))?$/i,
    /^create node(?:\s+(.*))?$/i,
    /^new node(?:\s+(.*))?$/i,
    /^add a node called(?:\s+(.*))?$/i,
];

const CONNECT_PATTERNS = [/^connect (.+)$/i, /^link (.+)$/i];

const REMOVE_NODE_PATTERNS = [/^remove node (.+)$/i, /^delete node (.+)$/i];

const REMOVE_EDGE_PATTERNS = [
    /^remove edge (.+)$/i,
    /^delete edge (.+)$/i,
    /^disconnect (.+)$/i,
];

export function parseCommand(
    input: string,
    architecture: Architecture,
): CommandResult {
    const trimmed = input.trim();

    const addNodeMatch = matchFirst(ADD_NODE_PATTERNS, trimmed);
    if (addNodeMatch) {
        const label = normalizeLabel(addNodeMatch[1] ?? "");
        if (isBlankLabel(label)) {
            return { ok: false, message: "A node label cannot be blank." };
        }
        const duplicate = findNodeByExactLabel(label, architecture);
        if (duplicate) {
            return {
                ok: false,
                message: `A node named "${duplicate.data.label}" already exists.`,
            };
        }
        const node: ArchitectureNode = {
            id: uniqueNodeId(slugify(label), architecture),
            position: { x: architecture.nodes.length * 250, y: 0 },
            data: { label },
        };
        return {
            ok: true,
            architecture: {
                ...architecture,
                nodes: [...architecture.nodes, node],
            },
            message: `Added node "${label}".`,
        };
    }

    const connectMatch = matchFirst(CONNECT_PATTERNS, trimmed);
    if (connectMatch) {
        const resolved = resolveConnectionEndpoints(
            connectMatch[1],
            architecture,
            CONNECT_SEPARATORS,
        );
        if (!resolved) {
            return { ok: false, message: `Unrecognized command: "${trimmed}"` };
        }
        const { source, target, sourceLabel, targetLabel } = resolved;
        if (!source) {
            return { ok: false, message: `No node named "${sourceLabel}".` };
        }
        if (!target) {
            return { ok: false, message: `No node named "${targetLabel}".` };
        }
        if (source.id === target.id) {
            return {
                ok: false,
                message: `Cannot connect "${source.data.label}" to itself.`,
            };
        }
        const alreadyConnected = architecture.edges.some(
            (e) => e.source === source.id && e.target === target.id,
        );
        if (alreadyConnected) {
            return {
                ok: false,
                message: `An edge from "${source.data.label}" to "${target.data.label}" already exists.`,
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
        const node = findNodeByLabel(label, architecture);
        if (!node) {
            return { ok: false, message: `No node named "${label}".` };
        }
        return {
            ok: true,
            architecture: {
                nodes: architecture.nodes.filter((n) => n.id !== node.id),
                edges: architecture.edges.filter(
                    (edge) =>
                        edge.source !== node.id && edge.target !== node.id,
                ),
            },
            message: `Removed node "${node.data.label}".`,
        };
    }

    const removeEdgeMatch = matchFirst(REMOVE_EDGE_PATTERNS, trimmed);
    if (removeEdgeMatch) {
        const resolved = resolveConnectionEndpoints(
            removeEdgeMatch[1],
            architecture,
            DISCONNECT_SEPARATORS,
        );
        if (!resolved) {
            return { ok: false, message: `Unrecognized command: "${trimmed}"` };
        }
        const { source, target, sourceLabel, targetLabel } = resolved;
        if (!source) {
            return { ok: false, message: `No node named "${sourceLabel}".` };
        }
        if (!target) {
            return { ok: false, message: `No node named "${targetLabel}".` };
        }
        const edge = architecture.edges.find(
            (e) => e.source === source.id && e.target === target.id,
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

    return { ok: false, message: `Unrecognized command: "${trimmed}"` };
}

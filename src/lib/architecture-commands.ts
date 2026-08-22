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

export type CommandResult =
    | {
          ok: true;
          architecture: Architecture;
          message: string;
      }
    | { ok: false; message: string };

// callers always pass a normalizeLabel()'d string
function isBlankLabel(label: string): boolean {
    return label.length === 0;
}

function slugify(label: string): string {
    return label
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/(^-|-$)/g, "");
}

function uniqueNodeId(slug: string, architecture: Architecture): string {
    const usedIds = new Set(architecture.nodes.map((node) => node.id));
    let id = `node-${slug}`;
    let suffix = 2;
    while (usedIds.has(id)) {
        id = `node-${slug}-${suffix}`;
        suffix += 1;
    }
    return id;
}

// null = no match, array = ambiguous (multiple substring matches, no exact one)
function foldLabel(label: string): string {
    return label.normalize("NFC").toLowerCase();
}

function findNodeOrAmbiguity(
    label: string,
    architecture: Architecture,
): ArchitectureNode | ArchitectureNode[] | null {
    const needle = normalizeLabel(label).toLowerCase();
    if (needle.length === 0) return null;
    const exact = architecture.nodes.find(
        (node) => foldLabel(node.data.label) === needle,
    );
    if (exact) return exact;
    const matches = architecture.nodes.filter((node) =>
        foldLabel(node.data.label).includes(needle),
    );
    if (matches.length === 0) return null;
    if (matches.length === 1) return matches[0];
    return matches;
}

function ambiguousLabelMessage(
    label: string,
    matches: ArchitectureNode[],
): string {
    const names = matches.map((node) => `"${node.data.label}"`).join(", ");
    return `"${label}" matches multiple nodes: ${names}. Be more specific.`;
}

function findNodeByExactLabel(
    label: string,
    architecture: Architecture,
): ArchitectureNode | undefined {
    const needle = normalizeLabel(label).toLowerCase();
    return architecture.nodes.find(
        (node) => foldLabel(node.data.label) === needle,
    );
}

// "<A> <sep> <B>" is ambiguous when a label itself contains a separator word
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

type EndpointMatch = ArchitectureNode | ArchitectureNode[] | null;

type ResolvedEndpoints = {
    sourceLabel: string;
    targetLabel: string;
    source: EndpointMatch;
    target: EndpointMatch;
};

function isSingleNode(match: EndpointMatch): match is ArchitectureNode {
    return match !== null && !Array.isArray(match);
}

function resolveConnectionEndpoints(
    rest: string,
    architecture: Architecture,
    separators: string[],
): ResolvedEndpoints | null {
    const splits = splitConnectionArgs(rest, separators);
    if (splits.length === 0) return null;

    const resolved = splits.map((split) => ({
        ...split,
        source: findNodeOrAmbiguity(split.sourceLabel, architecture),
        target: findNodeOrAmbiguity(split.targetLabel, architecture),
    }));

    return (
        resolved.find(
            (r) => isSingleNode(r.source) && isSingleNode(r.target),
        ) ?? resolved[0]
    );
}

type ResolvedRenameArgs = {
    sourceLabel: string;
    newLabel: string;
    source: EndpointMatch;
};

// Unlike resolveConnectionEndpoints, only the left side is a node reference
function resolveRenameArgs(
    rest: string,
    architecture: Architecture,
    separators: string[],
): ResolvedRenameArgs | null {
    const splits = splitConnectionArgs(rest, separators);
    if (splits.length === 0) return null;

    const resolved = splits.map((split) => ({
        sourceLabel: split.sourceLabel,
        newLabel: split.targetLabel,
        source: findNodeOrAmbiguity(split.sourceLabel, architecture),
    }));

    return resolved.find((r) => isSingleNode(r.source)) ?? resolved[0];
}

const ADD_NODE_PATTERNS = [
    /^add node(?:\s+(.*))?$/i,
    /^create node(?:\s+(.*))?$/i,
    /^new node(?:\s+(.*))?$/i,
    /^add a node called(?:\s+(.*))?$/i,
];

export type ParseCommandOptions = {
    // Where a canvas-created node lands; typed "add node" ignores this and
    // uses the default formula below
    position?: { x: number; y: number };
};

export function parseCommand(
    input: string,
    architecture: Architecture,
    options: ParseCommandOptions = {},
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
            position: options.position ?? {
                x: architecture.nodes.length * 250,
                y: 0,
            },
            data: { label, description: `Reaches "${label}".` },
        };
        return {
            ok: true,
            architecture: {
                ...architecture,
                nodes: [...architecture.nodes, node],
            },
            message: `Added node "${label}" as simulation step ${architecture.nodes.length + 1}.`,
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
            return {
                ok: false,
                message: `Couldn't find a "to" or "and" separator in "${connectMatch[1]}". Try: connect <A> to <B>.`,
            };
        }
        const { source, target, sourceLabel, targetLabel } = resolved;
        if (source === null) {
            return { ok: false, message: `No node named "${sourceLabel}".` };
        }
        if (Array.isArray(source)) {
            return {
                ok: false,
                message: ambiguousLabelMessage(sourceLabel, source),
            };
        }
        if (target === null) {
            return { ok: false, message: `No node named "${targetLabel}".` };
        }
        if (Array.isArray(target)) {
            return {
                ok: false,
                message: ambiguousLabelMessage(targetLabel, target),
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
        const resolved = findNodeOrAmbiguity(label, architecture);
        if (resolved === null) {
            return { ok: false, message: `No node named "${label}".` };
        }
        if (Array.isArray(resolved)) {
            return {
                ok: false,
                message: ambiguousLabelMessage(label, resolved),
            };
        }
        const node = resolved;
        return {
            ok: true,
            architecture: {
                nodes: architecture.nodes.filter((n) => n.id !== node.id),
                edges: architecture.edges.filter(
                    (edge) =>
                        edge.source !== node.id && edge.target !== node.id,
                ),
            },
            message: `Removed node "${node.data.label}" and its simulation step.`,
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
            return {
                ok: false,
                message: `Couldn't find a "to"/"from"/"and" separator in "${removeEdgeMatch[1]}". Try: remove edge <A> to <B>.`,
            };
        }
        const { source, target, sourceLabel, targetLabel } = resolved;
        if (source === null) {
            return { ok: false, message: `No node named "${sourceLabel}".` };
        }
        if (Array.isArray(source)) {
            return {
                ok: false,
                message: ambiguousLabelMessage(sourceLabel, source),
            };
        }
        if (target === null) {
            return { ok: false, message: `No node named "${targetLabel}".` };
        }
        if (Array.isArray(target)) {
            return {
                ok: false,
                message: ambiguousLabelMessage(targetLabel, target),
            };
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

    const renameNodeMatch = matchFirst(RENAME_NODE_PATTERNS, trimmed);
    if (renameNodeMatch) {
        const resolved = resolveRenameArgs(
            renameNodeMatch[1],
            architecture,
            RENAME_SEPARATORS,
        );
        if (!resolved) {
            return {
                ok: false,
                message: `Couldn't find a "to" separator in "${renameNodeMatch[1]}". Try: rename node <A> to <B>.`,
            };
        }
        const { source, sourceLabel, newLabel } = resolved;
        if (source === null) {
            return { ok: false, message: `No node named "${sourceLabel}".` };
        }
        if (Array.isArray(source)) {
            return {
                ok: false,
                message: ambiguousLabelMessage(sourceLabel, source),
            };
        }
        const normalizedNewLabel = normalizeLabel(newLabel);
        if (isBlankLabel(normalizedNewLabel)) {
            return { ok: false, message: "A node label cannot be blank." };
        }
        if (foldLabel(normalizedNewLabel) === foldLabel(source.data.label)) {
            return {
                ok: false,
                message: `"${source.data.label}" is already named that.`,
            };
        }
        const duplicate = findNodeByExactLabel(
            normalizedNewLabel,
            architecture,
        );
        if (duplicate) {
            return {
                ok: false,
                message: `A node named "${duplicate.data.label}" already exists.`,
            };
        }
        const renamedNodes = architecture.nodes.map((node) =>
            node.id === source.id
                ? {
                      ...node,
                      data: {
                          ...node.data,
                          label: normalizedNewLabel,
                          description: `Reaches "${normalizedNewLabel}".`,
                      },
                  }
                : node,
        );
        return {
            ok: true,
            architecture: { ...architecture, nodes: renamedNodes },
            message: `Renamed "${source.data.label}" to "${normalizedNewLabel}".`,
        };
    }

    return {
        ok: false,
        message: `Unrecognized command: "${trimmed}". Try: add node <label>; connect <A> to <B>; remove node <label>; remove edge <A> to <B>; rename node <A> to <B>.`,
    };
}

import type { Architecture, ArchitectureNode } from "@/types/architecture";

export type CommandResult =
    | { ok: true; architecture: Architecture; message: string }
    | { ok: false; message: string };

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
    const needle = label.trim().toLowerCase();
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

function splitConnectionArgs(
    rest: string,
): { sourceLabel: string; targetLabel: string }[] {
    const lower = rest.toLowerCase();
    const splits: { sourceLabel: string; targetLabel: string }[] = [];
    let from = 0;
    while (true) {
        const idx = lower.indexOf(" to ", from);
        if (idx === -1) break;
        splits.push({
            sourceLabel: rest.slice(0, idx).trim(),
            targetLabel: rest.slice(idx + 4).trim(),
        });
        from = idx + 1;
    }
    return splits;
}

type ResolvedEndpoints = {
    sourceLabel: string;
    targetLabel: string;
    source: ArchitectureNode | undefined;
    target: ArchitectureNode | undefined;
};

// "<A> to <B>" is ambiguous when a label itself contains " to " (e.g. "Point to
// Point Link"): try every " to " split point and prefer the one where both sides
// resolve to real nodes, falling back to the first split for error reporting.
function resolveConnectionEndpoints(
    rest: string,
    architecture: Architecture,
): ResolvedEndpoints | null {
    const splits = splitConnectionArgs(rest);
    if (splits.length === 0) return null;

    const resolved = splits.map((split) => ({
        ...split,
        source: findNodeByLabel(split.sourceLabel, architecture),
        target: findNodeByLabel(split.targetLabel, architecture),
    }));

    return resolved.find((r) => r.source && r.target) ?? resolved[0];
}

export function parseCommand(
    input: string,
    architecture: Architecture,
): CommandResult {
    const trimmed = input.trim();

    const addNodeMatch = trimmed.match(/^add node (.+)$/i);
    if (addNodeMatch) {
        const label = addNodeMatch[1].trim();
        const node: ArchitectureNode = {
            id: uniqueNodeId(slugify(label), architecture),
            position: { x: architecture.nodes.length * 250, y: 0 },
            data: { label },
        };
        return {
            ok: true,
            architecture: { ...architecture, nodes: [...architecture.nodes, node] },
            message: `Added node "${label}".`,
        };
    }

    const connectMatch = trimmed.match(/^connect (.+)$/i);
    if (connectMatch) {
        const resolved = resolveConnectionEndpoints(connectMatch[1], architecture);
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
            architecture: { ...architecture, edges: [...architecture.edges, edge] },
            message: `Connected "${source.data.label}" to "${target.data.label}".`,
        };
    }

    const removeNodeMatch = trimmed.match(/^remove node (.+)$/i);
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
                    (edge) => edge.source !== node.id && edge.target !== node.id,
                ),
            },
            message: `Removed node "${node.data.label}".`,
        };
    }

    const removeEdgeMatch = trimmed.match(/^remove edge (.+)$/i);
    if (removeEdgeMatch) {
        const resolved = resolveConnectionEndpoints(removeEdgeMatch[1], architecture);
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

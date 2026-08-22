import {
    ADD_STEP_PATTERNS,
    CONNECT_PATTERNS,
    CONNECT_SEPARATORS,
    DISCONNECT_SEPARATORS,
    INSERT_STEP_PATTERNS,
    REMOVE_EDGE_PATTERNS,
    REMOVE_NODE_PATTERNS,
    matchFirst,
    normalizeLabel,
} from "@/lib/node-reference";
import type { Architecture, ArchitectureNode } from "@/types/architecture";
import type { SimulationStep, SimulationTrace } from "@/types/simulation";

export type CommandResult =
    | {
          ok: true;
          architecture: Architecture;
          trace: SimulationTrace;
          message: string;
      }
    | { ok: false; message: string };

// callers always pass a normalizeLabel()'d string, which already strips
// invisible characters and trims whitespace
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

// Also avoids ids still referenced by orphaned trace steps
function uniqueNodeId(
    slug: string,
    architecture: Architecture,
    trace: SimulationTrace,
): string {
    const usedIds = new Set<string>([
        ...architecture.nodes.map((node) => node.id),
        ...trace.map((step) => step.nodeId),
    ]);
    let id = `node-${slug}`;
    let suffix = 2;
    while (usedIds.has(id)) {
        id = `node-${slug}-${suffix}`;
        suffix += 1;
    }
    return id;
}

// null = no match, array = ambiguous (multiple substring matches, no exact one)
// Unicode-folds a stored label the same way normalizeLabel() folds typed
// input, so a label loaded from persisted state (which may predate this
// normalization, or come from outside the app) still compares correctly.
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

const ADD_NODE_PATTERNS = [
    /^add node(?:\s+(.*))?$/i,
    /^create node(?:\s+(.*))?$/i,
    /^new node(?:\s+(.*))?$/i,
    /^add a node called(?:\s+(.*))?$/i,
];

const SET_STEP_DESCRIPTION_PATTERNS = [
    /^set step (\d+) description(?:\s+(.*))?$/i,
];

const REMOVE_STEP_PATTERNS = [/^remove step (\d+)$/i];

const MOVE_STEP_PATTERNS = [/^move step (\d+) to (\d+)$/i];

function renumberSteps(trace: SimulationTrace): SimulationTrace {
    return trace.map((step, index) => ({ ...step, step: index + 1 }));
}

export function parseCommand(
    input: string,
    architecture: Architecture,
    trace: SimulationTrace = [],
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
            id: uniqueNodeId(slugify(label), architecture, trace),
            position: { x: architecture.nodes.length * 250, y: 0 },
            data: { label },
        };
        return {
            ok: true,
            architecture: {
                ...architecture,
                nodes: [...architecture.nodes, node],
            },
            trace,
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
            trace,
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
            trace,
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
            trace,
            message: `Removed edge from "${source.data.label}" to "${target.data.label}".`,
        };
    }

    const addStepMatch = matchFirst(ADD_STEP_PATTERNS, trimmed);
    if (addStepMatch) {
        const label = normalizeLabel(addStepMatch[1] ?? "");
        if (isBlankLabel(label)) {
            return { ok: false, message: "A step must reference a node." };
        }
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
        const step: SimulationStep = {
            step: trace.length + 1,
            nodeId: node.id,
            description: `Reaches "${node.data.label}".`,
        };
        return {
            ok: true,
            architecture,
            trace: [...trace, step],
            message: `Added step ${step.step}: reaches "${node.data.label}".`,
        };
    }

    const insertStepMatch = matchFirst(INSERT_STEP_PATTERNS, trimmed);
    if (insertStepMatch) {
        const rawPosition = insertStepMatch[1];
        const position = Number(rawPosition);
        const label = normalizeLabel(insertStepMatch[2] ?? "");
        if (isBlankLabel(label)) {
            return { ok: false, message: "A step must reference a node." };
        }
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
        const maxPosition = trace.length + 1;
        if (position < 1 || position > maxPosition) {
            return {
                ok: false,
                // echoes the digits as typed — Number() loses precision or
                // switches to scientific notation well before it can reach
                // a valid position, so it must not be used for display here
                message: `No position numbered ${rawPosition}; valid positions are 1-${maxPosition}.`,
            };
        }
        const index = position - 1;
        const step: SimulationStep = {
            step: position,
            nodeId: node.id,
            description: `Reaches "${node.data.label}".`,
        };
        const nextTrace = [
            ...trace.slice(0, index),
            step,
            ...trace.slice(index),
        ];
        return {
            ok: true,
            architecture,
            trace: renumberSteps(nextTrace),
            message: `Inserted step ${rawPosition}: reaches "${node.data.label}".`,
        };
    }

    const setStepDescriptionMatch = matchFirst(
        SET_STEP_DESCRIPTION_PATTERNS,
        trimmed,
    );
    if (setStepDescriptionMatch) {
        const rawStepNumber = setStepDescriptionMatch[1];
        const stepNumber = Number(rawStepNumber);
        const description = normalizeLabel(setStepDescriptionMatch[2] ?? "");
        if (isBlankLabel(description)) {
            return {
                ok: false,
                message: "A step description cannot be blank.",
            };
        }
        const index = stepNumber - 1;
        if (index < 0 || index >= trace.length) {
            return {
                ok: false,
                message: `No step numbered ${rawStepNumber}.`,
            };
        }
        return {
            ok: true,
            architecture,
            trace: trace.map((step, i) =>
                i === index ? { ...step, description } : step,
            ),
            message: `Updated step ${rawStepNumber}'s description.`,
        };
    }

    const removeStepMatch = matchFirst(REMOVE_STEP_PATTERNS, trimmed);
    if (removeStepMatch) {
        const rawStepNumber = removeStepMatch[1];
        const stepNumber = Number(rawStepNumber);
        const index = stepNumber - 1;
        if (index < 0 || index >= trace.length) {
            return {
                ok: false,
                message: `No step numbered ${rawStepNumber}.`,
            };
        }
        return {
            ok: true,
            architecture,
            trace: renumberSteps(trace.filter((_, i) => i !== index)),
            message: `Removed step ${rawStepNumber}.`,
        };
    }

    const moveStepMatch = matchFirst(MOVE_STEP_PATTERNS, trimmed);
    if (moveStepMatch) {
        const rawFrom = moveStepMatch[1];
        const rawTo = moveStepMatch[2];
        const from = Number(rawFrom);
        const to = Number(rawTo);
        const fromIndex = from - 1;
        if (fromIndex < 0 || fromIndex >= trace.length) {
            return { ok: false, message: `No step numbered ${rawFrom}.` };
        }
        const toIndex = to - 1;
        if (toIndex < 0 || toIndex >= trace.length) {
            return { ok: false, message: `No step numbered ${rawTo}.` };
        }
        if (from === to) {
            return {
                ok: true,
                architecture,
                trace,
                message: `Step ${rawFrom} is already at position ${rawTo}.`,
            };
        }
        const step = trace[fromIndex];
        const remaining = trace.filter((_, i) => i !== fromIndex);
        const nextTrace = [
            ...remaining.slice(0, toIndex),
            step,
            ...remaining.slice(toIndex),
        ];
        return {
            ok: true,
            architecture,
            trace: renumberSteps(nextTrace),
            message: `Moved step ${rawFrom} to position ${rawTo}.`,
        };
    }

    return {
        ok: false,
        message: `Unrecognized command: "${trimmed}". Try: add node <label>; connect <A> to <B>; remove node <label>; remove edge <A> to <B>; add step <label>; insert step <n> <label>; set step <n> description <text>; remove step <n>; move step <a> to <b>.`,
    };
}

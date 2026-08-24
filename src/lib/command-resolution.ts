import {
    findSeparatorOccurrences,
    foldLabel,
    normalizeLabel,
} from "@/lib/node-reference";
import { findNodesBySubstring, type NodeIndex } from "@/lib/node-index";
import type { Architecture, ArchitectureNode } from "@/types/architecture";

/** Discriminated union from {@link parseCommand}; check `ok` before reading `architecture`. */
export type CommandResult =
    | {
          ok: true;
          architecture: Architecture;
          message: string;
      }
    | { ok: false; message: string };

/** True if `label` is empty. */
export function isBlankLabel(label: string): boolean {
    return label.length === 0;
}

/** Label length cap so canvas-synthesized commands stay under `MAX_COMMAND_LENGTH`. */
export const MAX_LABEL_LENGTH = 200;

export function isTooLongLabel(label: string): boolean {
    return label.length > MAX_LABEL_LENGTH;
}

/**
 * Slugifies a label: lowercased, non-alphanumeric collapsed to `-`.
 * @returns slug (may be empty)
 */
export function slugify(label: string): string {
    return label
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/(^-|-$)/g, "");
}

/**
 * Builds a node id from a slug, suffixing a number to avoid collisions.
 * @returns id not already in `nodeIndex.ids`
 */
export function uniqueNodeId(slug: string, nodeIndex: NodeIndex): string {
    let id = `node-${slug}`;
    let suffix = 2;
    while (nodeIndex.ids.has(id)) {
        id = `node-${slug}-${suffix}`;
        suffix += 1;
    }
    return id;
}

/**
 * Resolves a typed label: exact match wins, else substring match via the trie.
 * @param label - as-typed label text
 * @returns node, candidates if ambiguous, or null
 */
export function findNodeOrAmbiguity(
    label: string,
    nodeIndex: NodeIndex,
): ArchitectureNode | ArchitectureNode[] | null {
    const needle = normalizeLabel(label).toLowerCase();
    if (needle.length === 0) return null;
    const exact = nodeIndex.byLabel.get(needle);
    if (exact) return exact;
    const matches = findNodesBySubstring(nodeIndex, needle);
    if (matches.length === 0) return null;
    if (matches.length === 1) return matches[0];
    return matches;
}

const AMBIGUOUS_MATCHES_SHOWN = 20;

/**
 * Formats the ambiguous-match error: lists up to `AMBIGUOUS_MATCHES_SHOWN`, summarizing the rest as a count.
 * @param matches - matched nodes
 * @returns "be more specific" message
 */
function ambiguousLabelMessage(
    label: string,
    matches: ArchitectureNode[],
): string {
    const shown = matches
        .slice(0, AMBIGUOUS_MATCHES_SHOWN)
        .map((node) => `"${node.data.label}"`)
        .join(", ");
    const rest = matches.length - AMBIGUOUS_MATCHES_SHOWN;
    const names = rest > 0 ? `${shown}, and ${rest} more` : shown;
    return `"${label}" matches multiple nodes: ${names}. Be more specific.`;
}

function findNodeByExactLabel(
    label: string,
    nodeIndex: NodeIndex,
): ArchitectureNode | undefined {
    const needle = normalizeLabel(label).toLowerCase();
    return nodeIndex.byLabel.get(needle);
}

/**
 * Checks for an exact duplicate label (unlike the substring matching used to reference nodes). Shared by `add node`/`rename node`.
 * @param label - candidate label
 * @param nodeIndex - index to check
 * @returns failure if taken, else null
 */
export function duplicateLabelError(
    label: string,
    nodeIndex: NodeIndex,
): CommandResult | null {
    const duplicate = findNodeByExactLabel(label, nodeIndex);
    return duplicate
        ? {
              ok: false,
              message: `A node named "${duplicate.data.label}" already exists.`,
          }
        : null;
}

/**
 * Splits text into every possible source/target reading around each separator - a label may itself contain a separator word.
 * @param rest - text after the verb
 * @returns every possible split
 */
function splitConnectionArgs(
    rest: string,
    separators: string[],
): { sourceLabel: string; targetLabel: string }[] {
    return findSeparatorOccurrences(rest, separators).map(
        ({ index, length }) => ({
            sourceLabel: rest.slice(0, index).trim(),
            targetLabel: rest.slice(index + length).trim(),
        }),
    );
}

/** Label resolution result: single node, candidates if ambiguous, or null. */
type EndpointMatch = ArchitectureNode | ArchitectureNode[] | null;

/** One candidate reading of `connect <A> to <B>`: each side's raw label paired with its resolved {@link EndpointMatch}. */
type ResolvedEndpoints = {
    sourceLabel: string;
    targetLabel: string;
    source: EndpointMatch;
    target: EndpointMatch;
};

function isSingleNode(match: EndpointMatch): match is ArchitectureNode {
    return match !== null && !Array.isArray(match);
}

/** True when `sourceLabel` is the resolved node's whole label, not a substring - prefers an exact match over an ambiguous split. */
function isExactLabelMatch(sourceLabel: string, match: EndpointMatch): boolean {
    return (
        isSingleNode(match) &&
        foldLabel(normalizeLabel(sourceLabel)) === foldLabel(match.data.label)
    );
}

/**
 * Turns an {@link EndpointMatch} into the node or a failure message.
 * @param label - raw label, for the error message
 */
export function requireNode(
    label: string,
    match: EndpointMatch,
): { ok: true; node: ArchitectureNode } | { ok: false; message: string } {
    if (match === null) {
        return { ok: false, message: `No node named "${label}".` };
    }
    if (Array.isArray(match)) {
        return { ok: false, message: ambiguousLabelMessage(label, match) };
    }
    return { ok: true, node: match };
}

/**
 * Resolves `connect`/`remove edge` args: first split where both sides resolve to one node wins, else the first split.
 * @param rest - command text after the verb
 * @returns best-guess endpoints, or null
 */
export function resolveConnectionEndpoints(
    rest: string,
    nodeIndex: NodeIndex,
    separators: string[],
): ResolvedEndpoints | null {
    const splits = splitConnectionArgs(rest, separators);
    if (splits.length === 0) return null;

    const resolved = splits.map((split) => ({
        ...split,
        source: findNodeOrAmbiguity(split.sourceLabel, nodeIndex),
        target: findNodeOrAmbiguity(split.targetLabel, nodeIndex),
    }));

    return (
        resolved.find(
            (r) => isSingleNode(r.source) && isSingleNode(r.target),
        ) ?? resolved[0]
    );
}

/** One candidate reading of `rename node <A> to <B>`: source's raw label, resolved {@link EndpointMatch}, and new label text. */
type ResolvedRenameArgs = {
    sourceLabel: string;
    newLabel: string;
    source: EndpointMatch;
};

/**
 * Handles `rename node <A> to` with no new name typed: finds a trailing separator and returns a blank `newLabel`, so the caller reports
 * "cannot be blank" rather than "no separator found".
 * @param rest - text after the verb
 * @returns args with empty `newLabel`, or null
 */
function resolveTrailingSeparatorWithBlankTarget(
    rest: string,
    nodeIndex: NodeIndex,
    separators: string[],
): ResolvedRenameArgs | null {
    const lower = rest.toLowerCase();
    const trimmedSeparator = separators.find((separator) =>
        lower.endsWith(separator.trimEnd()),
    );
    if (!trimmedSeparator) return null;
    // The whole (untouched) rest is itself a real, complete label - it
    // legitimately ends in the separator word (e.g. a node named "Say To"
    // referenced with no new name given at all), so stripping the trailing
    // "to" here would truncate that label rather than find a separator.
    if (isExactLabelMatch(rest, findNodeOrAmbiguity(rest, nodeIndex))) {
        return null;
    }
    const sourceLabel = rest
        .slice(0, rest.length - trimmedSeparator.trimEnd().length)
        .trim();
    return {
        sourceLabel,
        newLabel: "",
        source: findNodeOrAmbiguity(sourceLabel, nodeIndex),
    };
}

/**
 * Resolves `rename node <A> to <B>` args - only `<A>` is a node reference. Prefers exact source match, then blank-target
 * ({@link resolveTrailingSeparatorWithBlankTarget}), then any single-node split, else the first split.
 * @param rest - text after the verb
 * @returns best-guess rename args, or null
 */
export function resolveRenameArgs(
    rest: string,
    nodeIndex: NodeIndex,
    separators: string[],
): ResolvedRenameArgs | null {
    const splits = splitConnectionArgs(rest, separators);
    const trailingBlank = resolveTrailingSeparatorWithBlankTarget(
        rest,
        nodeIndex,
        separators,
    );
    if (splits.length === 0) return trailingBlank;

    const resolved = splits.map((split) => ({
        sourceLabel: split.sourceLabel,
        newLabel: split.targetLabel,
        source: findNodeOrAmbiguity(split.sourceLabel, nodeIndex),
    }));

    return (
        resolved.find((r) => isExactLabelMatch(r.sourceLabel, r.source)) ??
        // A real (non-blank-target) split only ever wins here
        (trailingBlank &&
        isExactLabelMatch(trailingBlank.sourceLabel, trailingBlank.source)
            ? trailingBlank
            : null) ??
        resolved.find((r) => isSingleNode(r.source)) ??
        resolved[0]
    );
}

/** One candidate reading of `move node <label> to step <n>`: raw label, resolved {@link EndpointMatch}, and raw step-number text. */
type ResolvedMoveArgs = {
    sourceLabel: string;
    positionText: string;
    source: EndpointMatch;
};

/**
 * Resolves `move node <label> to step <n>` args - right side is a step number, not a node reference. Prefers exact source + digits-only
 * right side, then any single-node source, else the first split.
 * @param rest - text after the verb
 * @returns best-guess move args, or null
 */
export function resolveMoveNodeArgs(
    rest: string,
    nodeIndex: NodeIndex,
    separators: string[],
): ResolvedMoveArgs | null {
    const splits = splitConnectionArgs(rest, separators);
    if (splits.length === 0) return null;

    const resolved = splits.map((split) => ({
        sourceLabel: split.sourceLabel,
        positionText: split.targetLabel.trim(),
        source: findNodeOrAmbiguity(split.sourceLabel, nodeIndex),
    }));

    return (
        resolved.find(
            (r) =>
                isExactLabelMatch(r.sourceLabel, r.source) &&
                /^\d+$/.test(r.positionText),
        ) ??
        resolved.find(
            (r) => isSingleNode(r.source) && /^\d+$/.test(r.positionText),
        ) ??
        resolved[0]
    );
}

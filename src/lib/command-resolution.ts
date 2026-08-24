import {
    findSeparatorOccurrences,
    foldLabel,
    normalizeLabel,
} from "@/lib/node-reference";
import { findNodesBySubstring, type NodeIndex } from "@/lib/node-index";
import type { Architecture, ArchitectureNode } from "@/types/architecture";

/**
 * Result of running one command through {@link parseCommand}: a
 * discriminated union keyed on `ok`, forcing callers to check it before
 * reading `architecture`. A success carries the updated architecture plus
 * a message; a failure carries only the message.
 */
export type CommandResult =
    | {
          ok: true;
          architecture: Architecture;
          message: string;
      }
    | { ok: false; message: string };

/**
 * Checks whether a label is empty. Callers always pass an already-normalized
 * string, so this just checks length.
 */
export function isBlankLabel(label: string): boolean {
    return label.length === 0;
}

/**
 * Upper bound on a node label's length, so canvas-synthesized commands
 * referencing it (e.g. "rename node <old> to <new>") stay under
 * `MAX_COMMAND_LENGTH` and reachable from the canvas's mouse actions.
 */
export const MAX_LABEL_LENGTH = 200;

export function isTooLongLabel(label: string): boolean {
    return label.length > MAX_LABEL_LENGTH;
}

/**
 * Converts a label into a URL/id-safe slug: lowercased, non-alphanumeric
 * runs collapsed to a hyphen, edges trimmed.
 * @param label - label to slugify
 * @returns the slug; may be empty if the label had no alphanumeric characters
 */
export function slugify(label: string): string {
    return label
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/(^-|-$)/g, "");
}

/**
 * Builds a node id from a slug, appending a numeric suffix to avoid
 * collisions.
 * @param slug - base slug, see {@link slugify}
 * @param nodeIndex - checked for id collisions
 * @returns an id not already in `nodeIndex.ids`
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
 * Resolves a typed label to the {@link ArchitectureNode} it names: exact
 * match wins, else substring matching via the trie. One match resolves;
 * multiple is ambiguous; none (or blank) is nothing.
 * @param label - as-typed label text
 * @param nodeIndex - index to resolve against
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
 * Formats the error shown when a label substring-matches more than one
 * node: lists up to `AMBIGUOUS_MATCHES_SHOWN`, summarizing the rest as a
 * count.
 * @param label - the ambiguous label typed
 * @param matches - matched nodes
 * @returns message asking the user to be more specific
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
 * Checks a candidate label for an exact duplicate among existing labels,
 * unlike the substring matching used to reference nodes. Shared by
 * `add node` and `rename node`.
 * @param label - candidate label
 * @param nodeIndex - index to check against
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
 * Splits text after a command's verb into every possible source/target
 * reading around each separator occurrence - a label can itself contain a
 * separator word. Caller picks the best reading later.
 * @param rest - text after the verb
 * @param separators - words/phrases to split on
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

/**
 * Result of resolving a label: a single node on a clean match, candidates
 * when ambiguous, or null when nothing matches.
 */
type EndpointMatch = ArchitectureNode | ArchitectureNode[] | null;

/**
 * One candidate reading of `connect <A> to <B>`, pairing each side's raw
 * label with its resolved {@link EndpointMatch}. See
 * {@link resolveConnectionEndpoints}.
 */
type ResolvedEndpoints = {
    sourceLabel: string;
    targetLabel: string;
    source: EndpointMatch;
    target: EndpointMatch;
};

function isSingleNode(match: EndpointMatch): match is ArchitectureNode {
    return match !== null && !Array.isArray(match);
}

/**
 * True when `sourceLabel` is the resolved node's whole label, not just a
 * substring - used to prefer an exact match over an ambiguous split.
 * @param sourceLabel - raw label as typed
 * @param match - resolved {@link EndpointMatch}
 * @returns true if `match` is a single node equal to `sourceLabel`
 */
function isExactLabelMatch(sourceLabel: string, match: EndpointMatch): boolean {
    return (
        isSingleNode(match) &&
        foldLabel(normalizeLabel(sourceLabel)) === foldLabel(match.data.label)
    );
}

/**
 * Turns a raw {@link EndpointMatch} into the resolved node or a failure
 * message ("no node named…", or the ambiguity message).
 * @param label - raw label, for the error message
 * @param match - resolved {@link EndpointMatch}
 * @returns the node, or a failure with the message
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
 * Resolves `connect`/`remove edge` args. Tries every split (see
 * {@link splitConnectionArgs}); first where both sides resolve to one node
 * wins, else the first split.
 * @param rest - command text after the verb
 * @param nodeIndex - index for label lookup
 * @param separators - words to split on
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

/**
 * One candidate reading of `rename node <A> to <B>`, pairing the source's
 * raw label with its resolved {@link EndpointMatch} and the new label
 * text. Produced by {@link resolveRenameArgs}.
 */
type ResolvedRenameArgs = {
    sourceLabel: string;
    newLabel: string;
    source: EndpointMatch;
};

/**
 * Handles `rename node <A> to` with no new name typed yet: finds a
 * trailing separator, treats the text before it as the source label, and
 * returns a blank `newLabel` (so the caller reports "cannot be blank",
 * not "no separator found").
 * @param rest - text after the verb
 * @param nodeIndex - index for the source label
 * @param separators - separator words to look for
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
 * Resolves `rename node <A> to <B>` args - only `<A>` is a node reference.
 * Prefers exact source match, then the blank-target case
 * ({@link resolveTrailingSeparatorWithBlankTarget}), then a single-node
 * split, else the first split.
 * @param rest - text after the verb
 * @param nodeIndex - index for the source label
 * @param separators - words to split on
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

/**
 * One candidate reading of `move node <label> to step <n>`, pairing the
 * node's raw label with its resolved {@link EndpointMatch} and the raw
 * step-number text. Produced by {@link resolveMoveNodeArgs}.
 */
type ResolvedMoveArgs = {
    sourceLabel: string;
    positionText: string;
    source: EndpointMatch;
};

/**
 * Resolves `move node <label> to step <n>` args - the right side is a step
 * number, not a node reference. Prefers an exact source match with
 * digits-only right side, then any single-node source, else the first
 * split.
 * @param rest - text after the verb
 * @param nodeIndex - index for the source label
 * @param separators - words to split on
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

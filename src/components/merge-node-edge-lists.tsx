import type { Architecture } from "@/types/architecture";

/**
 * Props for {@link MergeNodeList}: the incoming file's nodes, which are
 * currently checked, labels that would collide on merge, and the toggle
 * handler.
 */
type MergeNodeListProps = {
    /** Architecture parsed from the imported file; source of merge candidates. */
    incoming: Architecture;
    /** Incoming node ids currently checked for inclusion. */
    selectedIds: ReadonlySet<string>;
    /** Folded labels in the current architecture, used to flag colliding incoming labels. */
    existingFoldedLabels: ReadonlySet<string>;
    /** Toggles whether an incoming node is selected. */
    onToggle: (nodeId: string) => void;
    /** Folds a label the same way `existingFoldedLabels` was built. */
    foldLabel: (label: string) => string;
};

/**
 * Checkbox list of every incoming node, flagging any whose label would
 * collide with an existing one.
 */
export function MergeNodeList({
    incoming,
    selectedIds,
    existingFoldedLabels,
    onToggle,
    foldLabel,
}: MergeNodeListProps) {
    return (
        <ul className="min-h-0 flex-1 space-y-1 overflow-y-auto">
            {incoming.nodes.map((node) => {
                const willRename = existingFoldedLabels.has(
                    foldLabel(node.data.label),
                );
                return (
                    <li key={node.id}>
                        <label className="flex cursor-pointer items-start gap-2 rounded px-1 py-1 hover:bg-border/40">
                            <input
                                type="checkbox"
                                checked={selectedIds.has(node.id)}
                                onChange={() => onToggle(node.id)}
                                className="mt-1"
                            />
                            <span className="min-w-0 flex-1 break-words">
                                <span className="text-foreground">
                                    {node.data.label}
                                </span>{" "}
                                <span className="text-muted-foreground">
                                    {node.id}
                                </span>
                                {willRename && (
                                    <span className="block text-xs text-muted-foreground">
                                        will be renamed to avoid a duplicate
                                        label
                                    </span>
                                )}
                            </span>
                        </label>
                    </li>
                );
            })}
        </ul>
    );
}

/**
 * Props for {@link MergeEdgeList}: the incoming file's edges, which nodes
 * and edges are currently selected/excluded, and the toggle handler.
 */
type MergeEdgeListProps = {
    /** Architecture parsed from the imported file; source of merge candidates. */
    incoming: Architecture;
    /** Incoming node ids currently checked for inclusion - an edge needs both endpoints selected to be eligible. */
    selectedIds: ReadonlySet<string>;
    /** Eligible incoming edge ids the user has explicitly unchecked. */
    excludedEdgeIds: ReadonlySet<string>;
    /** Incoming node id to label, for rendering `source → target`. */
    labelById: ReadonlyMap<string, string>;
    /** Toggles whether an eligible incoming edge is included. */
    onToggleEdge: (edgeId: string) => void;
};

/**
 * Checkbox list of every incoming edge; an edge whose endpoints aren't both
 * selected renders disabled and unchecked rather than being hidden.
 */
export function MergeEdgeList({
    incoming,
    selectedIds,
    excludedEdgeIds,
    labelById,
    onToggleEdge,
}: MergeEdgeListProps) {
    if (incoming.edges.length === 0) return null;
    return (
        <ul className="max-h-32 min-h-0 space-y-1 overflow-y-auto border-t border-border pt-2">
            {incoming.edges.map((edge) => {
                const eligible =
                    selectedIds.has(edge.source) &&
                    selectedIds.has(edge.target);
                return (
                    <li key={edge.id}>
                        <label
                            className={`flex cursor-pointer items-start gap-2 rounded px-1 py-1 hover:bg-border/40 ${
                                eligible ? "" : "cursor-not-allowed opacity-40"
                            }`}
                        >
                            <input
                                type="checkbox"
                                checked={
                                    eligible && !excludedEdgeIds.has(edge.id)
                                }
                                disabled={!eligible}
                                onChange={() => onToggleEdge(edge.id)}
                                className="mt-1"
                            />
                            <span className="min-w-0 flex-1 break-words text-foreground">
                                {labelById.get(edge.source) ?? edge.source} →{" "}
                                {labelById.get(edge.target) ?? edge.target}
                            </span>
                        </label>
                    </li>
                );
            })}
        </ul>
    );
}

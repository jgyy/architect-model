import type { Architecture } from "@/types/architecture";

/** Props for {@link MergeNodeList}: incoming nodes, selection state, and toggle handler. */
type MergeNodeListProps = {
    /** Parsed architecture from the imported file. */
    incoming: Architecture;
    /** Currently checked node ids. */
    selectedIds: ReadonlySet<string>;
    /** Existing folded labels; flags colliding incoming labels. */
    existingFoldedLabels: ReadonlySet<string>;
    /** Toggles selection of an incoming node. */
    onToggle: (nodeId: string) => void;
    /** Must fold the same way `existingFoldedLabels` was built. */
    foldLabel: (label: string) => string;
};

/** Checkbox list of incoming nodes, flagging label collisions with existing ones. */
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

/** Props for {@link MergeEdgeList}: incoming edges, selection state, and toggle handler. */
type MergeEdgeListProps = {
    /** Parsed architecture from the imported file. */
    incoming: Architecture;
    /** Checked node ids; both endpoints must be selected for an edge to be eligible. */
    selectedIds: ReadonlySet<string>;
    /** Eligible edge ids the user unchecked. */
    excludedEdgeIds: ReadonlySet<string>;
    /** Node id → label, for rendering `source → target`. */
    labelById: ReadonlyMap<string, string>;
    /** Toggles inclusion of an eligible edge. */
    onToggleEdge: (edgeId: string) => void;
};

/** Checkbox list of incoming edges; ineligible ones render disabled, not hidden. */
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

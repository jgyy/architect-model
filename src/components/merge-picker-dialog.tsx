"use client";

import { useEffect, useRef, useState } from "react";

import { MergeConnectSection } from "@/components/merge-connect-section";
import {
    MergeEdgeList,
    MergeNodeList,
} from "@/components/merge-node-edge-lists";
import {
    buildConnectGraph,
    connectableSourceIds,
    connectableTargetIds,
    connectOptionKey,
    decodeConnectOptionKey,
    type AddedConnectEdge,
    type ConnectOrigin,
} from "@/lib/architecture-io";
import { foldLabel } from "@/lib/node-reference";
import type { Architecture } from "@/types/architecture";

/** Props for {@link MergePickerDialog}: architectures, colliding labels, confirm/cancel callbacks. */
type MergePickerDialogProps = {
    /** Imported file's name; shown in title and Connect optgroup. */
    fileName: string;
    /** Architecture parsed from the imported file; source of merge candidates. */
    incoming: Architecture;
    /** Workspace architecture that `incoming` merges into. */
    current: Architecture;
    /** Folded labels in `current`; flags colliding incoming labels. */
    existingFoldedLabels: ReadonlySet<string>;
    /**
     * @param selectedNodeIds - incoming nodes to include.
     * @param excludedEdgeIds - unchecked despite eligible endpoints.
     * @param addedEdges - cross-architecture connections.
     * @param insertAtStep - splice index into `current.nodes`.
     */
    onConfirm: (
        selectedNodeIds: Set<string>,
        excludedEdgeIds: Set<string>,
        addedEdges: AddedConnectEdge[],
        insertAtStep: number,
    ) => void;
    /** Dismisses the dialog without merging. */
    onCancel: () => void;
};

/** Modal for merging an imported architecture: pick nodes/edges, splice point, and cross-architecture connections. */
export function MergePickerDialog({
    fileName,
    incoming,
    current,
    existingFoldedLabels,
    onConfirm,
    onCancel,
}: MergePickerDialogProps) {
    const [selectedIds, setSelectedIds] = useState<Set<string>>(
        () => new Set(incoming.nodes.map((node) => node.id)),
    );
    const [excludedEdgeIds, setExcludedEdgeIds] = useState<Set<string>>(
        () => new Set(),
    );
    const [addedEdges, setAddedEdges] = useState<AddedConnectEdge[]>([]);
    const [pendingSource, setPendingSource] = useState("");
    const [pendingTarget, setPendingTarget] = useState("");
    /** Splice index into `current.nodes`; node position encodes simulation step order. */
    const [insertAtStep, setInsertAtStep] = useState(current.nodes.length);
    const dialogRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        function handleKeyDown(event: KeyboardEvent) {
            if (event.key === "Escape") onCancel();
        }
        document.addEventListener("keydown", handleKeyDown);
        return () => document.removeEventListener("keydown", handleKeyDown);
    }, [onCancel]);

    // Moves keyboard focus into the dialog on open, and back to whatever
    // triggered it (the toolbar's Merge button) once it closes - otherwise
    // a keyboard user tabbing after opening it keeps reaching the
    // still-focusable console/canvas controls sitting behind the overlay.
    useEffect(() => {
        const previouslyFocused = document.activeElement as HTMLElement | null;
        dialogRef.current?.focus();
        return () => {
            previouslyFocused?.focus();
        };
    }, []);

    /**
     * Toggles node selection; also drops any added connection touching it.
     * @param nodeId - incoming node id.
     */
    function toggle(nodeId: string) {
        setSelectedIds((current) => {
            const next = new Set(current);
            if (next.has(nodeId)) {
                next.delete(nodeId);
            } else {
                next.add(nodeId);
            }
            return next;
        });
        const key = connectOptionKey("incoming", nodeId);
        setAddedEdges((current) =>
            current.filter(
                (added) => added.source !== key && added.target !== key,
            ),
        );
    }

    function toggleEdge(edgeId: string) {
        setExcludedEdgeIds((current) => {
            const next = new Set(current);
            if (next.has(edgeId)) {
                next.delete(edgeId);
            } else {
                next.add(edgeId);
            }
            return next;
        });
    }

    function removeAddedEdge(source: string, target: string) {
        setAddedEdges((current) =>
            current.filter(
                (added) => added.source !== source || added.target !== target,
            ),
        );
    }

    const labelById = new Map(
        incoming.nodes.map((node) => [node.id, node.data.label]),
    );
    /** Maps connect option keys (`current:<id>`/`incoming:<id>`) to node labels. */
    const labelByKey = new Map<string, string>([
        ...current.nodes.map(
            (node) =>
                [
                    connectOptionKey("current", node.id),
                    node.data.label,
                ] as const,
        ),
        ...incoming.nodes.map(
            (node) =>
                [
                    connectOptionKey("incoming", node.id),
                    node.data.label,
                ] as const,
        ),
    ]);
    /**
     * Resolves a key to its label, falling back to the bare id.
     * @param key - connect option key.
     * @returns label or raw id.
     */
    function labelForKey(key: string): string {
        return labelByKey.get(key) ?? decodeConnectOptionKey(key).id;
    }
    /**
     * Filters connect option keys to one merge side (for optgroup split).
     * @param ids - keys to filter.
     * @param origin - side to keep.
     * @returns matching subset.
     */
    function optionsByOrigin(ids: string[], origin: ConnectOrigin): string[] {
        return ids.filter((id) => decodeConnectOptionKey(id).origin === origin);
    }

    /** Incoming edges whose endpoints are both selected. */
    const eligibleEdges = incoming.edges.filter(
        (edge) => selectedIds.has(edge.source) && selectedIds.has(edge.target),
    );
    /** `eligibleEdges` minus user-unchecked edges. */
    const keptEdges = eligibleEdges.filter(
        (edge) => !excludedEdgeIds.has(edge.id),
    );
    /** Total merged edges: kept incoming edges plus additions. */
    const includedEdgeCount = keptEdges.length + addedEdges.length;

    const selectedNodes = incoming.nodes.filter((node) =>
        selectedIds.has(node.id),
    );
    /** Graph Connect validates against: `current` plus selected incoming nodes/edges, namespaced to avoid id collisions. */
    const connectGraph = buildConnectGraph(current, selectedNodes, keptEdges);
    /** `connectGraph`'s edges plus added edges, so options reflect the latest addition. */
    const netEdges = [
        ...connectGraph.edges,
        ...addedEdges.map((added) => ({ id: "", ...added })),
    ];
    /** Ids eligible as a connection source (no outgoing edge); nodes allow at most one outgoing/incoming edge (disjoint chains). */
    const sourceOptionIds = [
        ...connectableSourceIds(connectGraph.nodes, netEdges),
    ];
    // The select's actual value: `pendingSource` if it's still a valid
    // option, otherwise the first available one - covers the case where the
    // previously chosen source stopped being connectable (e.g. its node was
    // deselected).
    const effectiveSource = sourceOptionIds.includes(pendingSource)
        ? pendingSource
        : (sourceOptionIds[0] ?? "");
    /** Ids `effectiveSource` can connect to, without a second incoming edge or a cycle. */
    const targetOptionIds = effectiveSource
        ? [
              ...connectableTargetIds(
                  effectiveSource,
                  connectGraph.nodes,
                  netEdges,
              ),
          ]
        : [];
    // Same fallback logic as `effectiveSource`, for the target select.
    const effectiveTarget = targetOptionIds.includes(pendingTarget)
        ? pendingTarget
        : (targetOptionIds[0] ?? "");
    const canAddConnection = effectiveSource !== "" && effectiveTarget !== "";
    /** Whether both architectures together have enough nodes to connect. */
    const canShowConnect = current.nodes.length + selectedNodes.length >= 2;

    return (
        <div
            role="presentation"
            onClick={onCancel}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
        >
            <div
                ref={dialogRef}
                role="dialog"
                aria-modal="true"
                aria-label={`Merge nodes from "${fileName}"`}
                tabIndex={-1}
                onClick={(event) => event.stopPropagation()}
                className="flex max-h-[80vh] w-96 max-w-full flex-col gap-3 rounded-lg border border-border bg-chrome p-4 font-mono text-sm text-chrome-foreground shadow-md outline-none"
            >
                <div>
                    <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                        Merge from &quot;{fileName}&quot;
                    </span>
                </div>
                <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                    <button
                        type="button"
                        onClick={() =>
                            setSelectedIds(
                                new Set(incoming.nodes.map((node) => node.id)),
                            )
                        }
                        className="rounded-full border border-border px-2.5 py-1 hover:border-accent/60 hover:text-accent"
                    >
                        Select all
                    </button>
                    <button
                        type="button"
                        onClick={() => {
                            setSelectedIds(new Set());
                            setAddedEdges([]);
                        }}
                        className="rounded-full border border-border px-2.5 py-1 hover:border-accent/60 hover:text-accent"
                    >
                        Select none
                    </button>
                </div>
                <MergeNodeList
                    incoming={incoming}
                    selectedIds={selectedIds}
                    existingFoldedLabels={existingFoldedLabels}
                    onToggle={toggle}
                    foldLabel={foldLabel}
                />
                <MergeEdgeList
                    incoming={incoming}
                    selectedIds={selectedIds}
                    excludedEdgeIds={excludedEdgeIds}
                    labelById={labelById}
                    onToggleEdge={toggleEdge}
                />
                {current.nodes.length > 0 && (
                    <div className="space-y-1 border-t border-border pt-2">
                        <label
                            htmlFor="merge-insert-at-step"
                            className="block text-xs font-medium tracking-wide text-muted-foreground uppercase"
                        >
                            Insert at step
                        </label>
                        <select
                            id="merge-insert-at-step"
                            value={insertAtStep}
                            onChange={(event) =>
                                setInsertAtStep(Number(event.target.value))
                            }
                            className="w-full rounded-md border border-border bg-background px-1.5 py-1 text-xs text-foreground"
                        >
                            {current.nodes.map((node, index) => (
                                <option key={node.id} value={index}>
                                    Before step {index + 1}: {node.data.label}
                                </option>
                            ))}
                            <option value={current.nodes.length}>
                                At the end
                            </option>
                        </select>
                    </div>
                )}
                {canShowConnect && (
                    <MergeConnectSection
                        fileName={fileName}
                        sourceOptionIds={sourceOptionIds}
                        targetOptionIds={targetOptionIds}
                        effectiveSource={effectiveSource}
                        effectiveTarget={effectiveTarget}
                        onSourceChange={setPendingSource}
                        onTargetChange={setPendingTarget}
                        canAddConnection={canAddConnection}
                        onAddConnection={() =>
                            setAddedEdges((current) => [
                                ...current,
                                {
                                    source: effectiveSource,
                                    target: effectiveTarget,
                                },
                            ])
                        }
                        addedEdges={addedEdges}
                        onRemoveConnection={removeAddedEdge}
                        labelForKey={labelForKey}
                        optionsByOrigin={optionsByOrigin}
                    />
                )}
                <div className="text-xs text-muted-foreground">
                    <p>
                        {selectedIds.size} of {incoming.nodes.length} node(s)
                        selected
                    </p>
                    <p>{includedEdgeCount} edge(s) will be included</p>
                </div>
                <div className="flex justify-end gap-2">
                    <button
                        type="button"
                        onClick={onCancel}
                        className="rounded-full border border-border px-3 py-1.5 text-xs font-medium text-foreground hover:bg-border/40"
                    >
                        Cancel
                    </button>
                    <button
                        type="button"
                        disabled={selectedIds.size === 0}
                        onClick={() =>
                            onConfirm(
                                selectedIds,
                                excludedEdgeIds,
                                addedEdges,
                                insertAtStep,
                            )
                        }
                        className="rounded-full border border-accent bg-accent px-3 py-1.5 text-xs font-medium text-accent-foreground hover:bg-accent/90 disabled:pointer-events-none disabled:opacity-40"
                    >
                        Merge {selectedIds.size} node(s)
                    </button>
                </div>
            </div>
        </div>
    );
}

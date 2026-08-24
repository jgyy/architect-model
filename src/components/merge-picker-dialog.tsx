"use client";

import { useEffect, useRef, useState } from "react";

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

/**
 * Props for {@link MergePickerDialog}: the architectures being merged,
 * labels that would collide, and the confirm/cancel callbacks.
 */
type MergePickerDialogProps = {
    /** Imported file's name; used in the dialog title and Connect optgroup label. */
    fileName: string;
    /** Architecture parsed from the imported file; source of merge candidates. */
    incoming: Architecture;
    /** Workspace architecture that `incoming` merges into. */
    current: Architecture;
    /** Folded labels in `current`, used to flag colliding incoming labels. */
    existingFoldedLabels: ReadonlySet<string>;
    /**
     * Fires with everything needed to splice `incoming` into `current` when confirmed.
     * @param selectedNodeIds - ids of `incoming` nodes to include.
     * @param excludedEdgeIds - `incoming` edge ids unchecked though both endpoints qualified.
     * @param addedEdges - connections drawn between the two architectures via Connect.
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

/**
 * Modal dialog for resolving a merge conflict between an imported file and
 * the open architecture: pick which nodes/edges to merge, where to splice
 * them in, and optional cross-architecture connections.
 */
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
    /**
     * Splice index into `current.nodes` for the merged nodes; node position
     * encodes simulation step order. Defaults to the end.
     */
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
     * Toggles whether an incoming node is selected. Also drops any added
     * connection touching it, since endpoints are "connect option keys"
     * (`incoming:<id>`/`current:<id>`) namespacing ids by origin so the two
     * architectures' ids don't collide.
     * @param nodeId - the incoming node's id.
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
    /**
     * Maps each connect option key (`current:<id>`/`incoming:<id>`) to its
     * node's label, since Connect's options and edges use namespaced keys,
     * not raw ids.
     */
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
     * @param key - connect option key (`current:<id>`/`incoming:<id>`).
     * @returns the label, or raw id if none.
     */
    function labelForKey(key: string): string {
        return labelByKey.get(key) ?? decodeConnectOptionKey(key).id;
    }
    /**
     * Filters connect option keys to one merge side, for splitting the
     * Connect selects into optgroups.
     * @param ids - keys to filter.
     * @param origin - side to keep ("current" or "incoming").
     * @returns matching subset of `ids`.
     */
    function optionsByOrigin(ids: string[], origin: ConnectOrigin): string[] {
        return ids.filter((id) => decodeConnectOptionKey(id).origin === origin);
    }

    /**
     * Renders one connect `<select>` (source or target), grouped into
     * "Existing architecture" and `fileName` optgroups. Shared by the
     * Connect from/to selects.
     * @param ariaLabel - accessible label.
     * @param value - selected connect option key.
     * @param onChange - called with the new key.
     * @param optionIds - connect option keys to offer.
     * @returns the select element.
     */
    function renderConnectSelect(
        ariaLabel: string,
        value: string,
        onChange: (value: string) => void,
        optionIds: string[],
    ) {
        return (
            <select
                aria-label={ariaLabel}
                value={value}
                onChange={(event) => onChange(event.target.value)}
                className="min-w-0 flex-1 rounded-md border border-border bg-background px-1.5 py-1 text-xs text-foreground"
            >
                {optionsByOrigin(optionIds, "current").length > 0 && (
                    <optgroup label="Existing architecture">
                        {optionsByOrigin(optionIds, "current").map((key) => (
                            <option key={key} value={key}>
                                {labelForKey(key)}
                            </option>
                        ))}
                    </optgroup>
                )}
                {optionsByOrigin(optionIds, "incoming").length > 0 && (
                    <optgroup label={fileName}>
                        {optionsByOrigin(optionIds, "incoming").map((key) => (
                            <option key={key} value={key}>
                                {labelForKey(key)}
                            </option>
                        ))}
                    </optgroup>
                )}
            </select>
        );
    }

    /**
     * Incoming edges whose endpoints are both selected - only these can be
     * merged in.
     */
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
    /**
     * Graph the Connect control validates against: `current` plus selected
     * incoming nodes/edges, namespaced via `buildConnectGraph` to avoid id
     * collisions.
     */
    const connectGraph = buildConnectGraph(current, selectedNodes, keptEdges);
    /**
     * `connectGraph`'s edges plus this dialog's added edges, so recomputed
     * options reflect the latest addition.
     */
    const netEdges = [
        ...connectGraph.edges,
        ...addedEdges.map((added) => ({ id: "", ...added })),
    ];
    /**
     * Ids eligible as a connection source: nodes with no outgoing edge in
     * `netEdges`. Nodes allow at most one outgoing/incoming edge (disjoint
     * chains), and this enforces that limit.
     */
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
    /**
     * Ids `effectiveSource` can connect to, without a second incoming edge
     * or a cycle.
     */
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
                                        onChange={() => toggle(node.id)}
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
                                                will be renamed to avoid a
                                                duplicate label
                                            </span>
                                        )}
                                    </span>
                                </label>
                            </li>
                        );
                    })}
                </ul>
                {incoming.edges.length > 0 && (
                    <ul className="max-h-32 min-h-0 space-y-1 overflow-y-auto border-t border-border pt-2">
                        {incoming.edges.map((edge) => {
                            const eligible =
                                selectedIds.has(edge.source) &&
                                selectedIds.has(edge.target);
                            return (
                                <li key={edge.id}>
                                    <label
                                        className={`flex cursor-pointer items-start gap-2 rounded px-1 py-1 hover:bg-border/40 ${
                                            eligible
                                                ? ""
                                                : "cursor-not-allowed opacity-40"
                                        }`}
                                    >
                                        <input
                                            type="checkbox"
                                            checked={
                                                eligible &&
                                                !excludedEdgeIds.has(edge.id)
                                            }
                                            disabled={!eligible}
                                            onChange={() => toggleEdge(edge.id)}
                                            className="mt-1"
                                        />
                                        <span className="min-w-0 flex-1 break-words text-foreground">
                                            {labelById.get(edge.source) ??
                                                edge.source}{" "}
                                            →{" "}
                                            {labelById.get(edge.target) ??
                                                edge.target}
                                        </span>
                                    </label>
                                </li>
                            );
                        })}
                    </ul>
                )}
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
                    <div className="space-y-2 border-t border-border pt-2">
                        <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                            Connect
                        </span>
                        <div className="flex items-center gap-1.5">
                            {renderConnectSelect(
                                "Connect from",
                                effectiveSource,
                                setPendingSource,
                                sourceOptionIds,
                            )}
                            <span aria-hidden className="text-muted-foreground">
                                →
                            </span>
                            {renderConnectSelect(
                                "Connect to",
                                effectiveTarget,
                                setPendingTarget,
                                targetOptionIds,
                            )}
                            <button
                                type="button"
                                disabled={!canAddConnection}
                                onClick={() =>
                                    setAddedEdges((current) => [
                                        ...current,
                                        {
                                            source: effectiveSource,
                                            target: effectiveTarget,
                                        },
                                    ])
                                }
                                className="rounded-full border border-border px-2.5 py-1 text-xs whitespace-nowrap hover:border-accent/60 hover:text-accent disabled:pointer-events-none disabled:opacity-40"
                            >
                                Add connection
                            </button>
                        </div>
                        {addedEdges.length > 0 && (
                            <ul className="space-y-1">
                                {addedEdges.map((added) => {
                                    const fromLabel = labelForKey(added.source);
                                    const toLabel = labelForKey(added.target);
                                    return (
                                        <li
                                            key={`${added.source}-${added.target}`}
                                            className="flex items-center justify-between gap-2 text-foreground"
                                        >
                                            <span>
                                                {fromLabel} → {toLabel}
                                            </span>
                                            <button
                                                type="button"
                                                aria-label={`Remove connection: ${fromLabel} to ${toLabel}`}
                                                onClick={() =>
                                                    removeAddedEdge(
                                                        added.source,
                                                        added.target,
                                                    )
                                                }
                                                className="text-muted-foreground hover:text-foreground"
                                            >
                                                ×
                                            </button>
                                        </li>
                                    );
                                })}
                            </ul>
                        )}
                    </div>
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

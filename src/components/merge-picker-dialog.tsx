"use client";

import { useEffect, useState } from "react";

import {
    buildConnectGraph,
    connectableSourceIds,
    connectableTargetIds,
    connectOptionKey,
    decodeConnectOptionKey,
    foldLabel,
    type AddedConnectEdge,
    type ConnectOrigin,
} from "@/lib/architecture-io";
import type { Architecture } from "@/types/architecture";

type MergePickerDialogProps = {
    fileName: string;
    incoming: Architecture;
    current: Architecture;
    existingFoldedLabels: ReadonlySet<string>;
    onConfirm: (
        selectedNodeIds: Set<string>,
        excludedEdgeIds: Set<string>,
        addedEdges: AddedConnectEdge[],
    ) => void;
    onCancel: () => void;
};

// Lets the user choose which of an incoming file's nodes to merge in
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

    useEffect(() => {
        function handleKeyDown(event: KeyboardEvent) {
            if (event.key === "Escape") onCancel();
        }
        document.addEventListener("keydown", handleKeyDown);
        return () => document.removeEventListener("keydown", handleKeyDown);
    }, [onCancel]);

    // Deselecting a node also drops any added connection that touched it,
    // the same way it drops an incoming file edge - see toggleEdge below.
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
    // Covers both origins for the Connect control, whose option/added-edge
    // values are connectOptionKey-namespaced (see buildConnectGraph below).
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
    function labelForKey(key: string): string {
        return labelByKey.get(key) ?? decodeConnectOptionKey(key).id;
    }
    function optionsByOrigin(ids: string[], origin: ConnectOrigin): string[] {
        return ids.filter((id) => decodeConnectOptionKey(id).origin === origin);
    }

    const eligibleEdges = incoming.edges.filter(
        (edge) => selectedIds.has(edge.source) && selectedIds.has(edge.target),
    );
    const keptEdges = eligibleEdges.filter(
        (edge) => !excludedEdgeIds.has(edge.id),
    );
    const includedEdgeCount = keptEdges.length + addedEdges.length;

    const selectedNodes = incoming.nodes.filter((node) =>
        selectedIds.has(node.id),
    );
    const connectGraph = buildConnectGraph(current, selectedNodes, keptEdges);
    const netEdges = [
        ...connectGraph.edges,
        ...addedEdges.map((added) => ({ id: "", ...added })),
    ];
    const sourceOptionIds = [
        ...connectableSourceIds(connectGraph.nodes, netEdges),
    ];
    const effectiveSource = sourceOptionIds.includes(pendingSource)
        ? pendingSource
        : (sourceOptionIds[0] ?? "");
    const targetOptionIds = effectiveSource
        ? [
              ...connectableTargetIds(
                  effectiveSource,
                  connectGraph.nodes,
                  netEdges,
              ),
          ]
        : [];
    const effectiveTarget = targetOptionIds.includes(pendingTarget)
        ? pendingTarget
        : (targetOptionIds[0] ?? "");
    const canAddConnection = effectiveSource !== "" && effectiveTarget !== "";
    const canShowConnect = current.nodes.length + selectedNodes.length >= 2;

    return (
        <div
            role="presentation"
            onClick={onCancel}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
        >
            <div
                role="dialog"
                aria-modal="true"
                aria-label={`Merge nodes from "${fileName}"`}
                onClick={(event) => event.stopPropagation()}
                className="flex max-h-[80vh] w-96 max-w-full flex-col gap-3 rounded-lg border border-border bg-chrome p-4 font-mono text-sm text-chrome-foreground shadow-md"
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
                {canShowConnect && (
                    <div className="space-y-2 border-t border-border pt-2">
                        <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                            Connect
                        </span>
                        <div className="flex items-center gap-1.5">
                            <select
                                aria-label="Connect from"
                                value={effectiveSource}
                                onChange={(event) =>
                                    setPendingSource(event.target.value)
                                }
                                className="min-w-0 flex-1 rounded-md border border-border bg-background px-1.5 py-1 text-xs text-foreground"
                            >
                                {optionsByOrigin(sourceOptionIds, "current")
                                    .length > 0 && (
                                    <optgroup label="Existing architecture">
                                        {optionsByOrigin(
                                            sourceOptionIds,
                                            "current",
                                        ).map((key) => (
                                            <option key={key} value={key}>
                                                {labelForKey(key)}
                                            </option>
                                        ))}
                                    </optgroup>
                                )}
                                {optionsByOrigin(sourceOptionIds, "incoming")
                                    .length > 0 && (
                                    <optgroup label={fileName}>
                                        {optionsByOrigin(
                                            sourceOptionIds,
                                            "incoming",
                                        ).map((key) => (
                                            <option key={key} value={key}>
                                                {labelForKey(key)}
                                            </option>
                                        ))}
                                    </optgroup>
                                )}
                            </select>
                            <span aria-hidden className="text-muted-foreground">
                                →
                            </span>
                            <select
                                aria-label="Connect to"
                                value={effectiveTarget}
                                onChange={(event) =>
                                    setPendingTarget(event.target.value)
                                }
                                className="min-w-0 flex-1 rounded-md border border-border bg-background px-1.5 py-1 text-xs text-foreground"
                            >
                                {optionsByOrigin(targetOptionIds, "current")
                                    .length > 0 && (
                                    <optgroup label="Existing architecture">
                                        {optionsByOrigin(
                                            targetOptionIds,
                                            "current",
                                        ).map((key) => (
                                            <option key={key} value={key}>
                                                {labelForKey(key)}
                                            </option>
                                        ))}
                                    </optgroup>
                                )}
                                {optionsByOrigin(targetOptionIds, "incoming")
                                    .length > 0 && (
                                    <optgroup label={fileName}>
                                        {optionsByOrigin(
                                            targetOptionIds,
                                            "incoming",
                                        ).map((key) => (
                                            <option key={key} value={key}>
                                                {labelForKey(key)}
                                            </option>
                                        ))}
                                    </optgroup>
                                )}
                            </select>
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
                            onConfirm(selectedIds, excludedEdgeIds, addedEdges)
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

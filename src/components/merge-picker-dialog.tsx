"use client";

import { useEffect, useState } from "react";

import { foldLabel } from "@/lib/architecture-io";
import type { Architecture } from "@/types/architecture";

type MergePickerDialogProps = {
    fileName: string;
    incoming: Architecture;
    existingFoldedLabels: ReadonlySet<string>;
    onConfirm: (
        selectedNodeIds: Set<string>,
        excludedEdgeIds: Set<string>,
    ) => void;
    onCancel: () => void;
};

// Lets the user choose which of an incoming file's nodes to merge in,
// rather than always merging the whole file. Deselecting a node also
// drops any incoming edge that touches it (previewed via the live count).
// An edge whose endpoints are both still selected can also be dropped on
// its own, via a separate checkbox - that choice persists even if its
// nodes get toggled off and back on.
export function MergePickerDialog({
    fileName,
    incoming,
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

    useEffect(() => {
        function handleKeyDown(event: KeyboardEvent) {
            if (event.key === "Escape") onCancel();
        }
        document.addEventListener("keydown", handleKeyDown);
        return () => document.removeEventListener("keydown", handleKeyDown);
    }, [onCancel]);

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

    const labelById = new Map(
        incoming.nodes.map((node) => [node.id, node.data.label]),
    );
    const eligibleEdges = incoming.edges.filter(
        (edge) => selectedIds.has(edge.source) && selectedIds.has(edge.target),
    );
    const includedEdgeCount = eligibleEdges.filter(
        (edge) => !excludedEdgeIds.has(edge.id),
    ).length;

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
                        onClick={() => setSelectedIds(new Set())}
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
                        onClick={() => onConfirm(selectedIds, excludedEdgeIds)}
                        className="rounded-full border border-accent bg-accent px-3 py-1.5 text-xs font-medium text-accent-foreground hover:bg-accent/90 disabled:pointer-events-none disabled:opacity-40"
                    >
                        Merge {selectedIds.size} node(s)
                    </button>
                </div>
            </div>
        </div>
    );
}

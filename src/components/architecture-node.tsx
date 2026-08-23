"use client";

import { createContext, useContext, useEffect, useRef, useState } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { X } from "lucide-react";

import type { ArchitectureNode as ArchitectureNodeType } from "@/types/architecture";

// Which node the simulation is currently on, and which it has already crossed
export type SimulationHighlight = {
    currentNodeId?: string;
    traversedNodeIds: Set<string>;
};

const EMPTY_HIGHLIGHT: SimulationHighlight = { traversedNodeIds: new Set() };

export const HighlightedNodeContext =
    createContext<SimulationHighlight>(EMPTY_HIGHLIGHT);

// Mouse-driven mutations, wired up by ArchitectureCanvas
export type NodeActions = {
    // Returns whether the rename was accepted
    onRename: (nodeId: string, newLabel: string) => boolean;
    onDelete: (nodeId: string) => void;
    // Id of a just-created node that should open straight into edit mode
    autoEditNodeId: string | null;
    onAutoEditConsumed: () => void;
};

const NOOP_NODE_ACTIONS: NodeActions = {
    onRename: () => true,
    onDelete: () => {},
    autoEditNodeId: null,
    onAutoEditConsumed: () => {},
};

export const NodeActionsContext = createContext<NodeActions>(NOOP_NODE_ACTIONS);

export function ArchitectureNode({
    id,
    data,
    selected,
}: NodeProps<ArchitectureNodeType>) {
    const { currentNodeId, traversedNodeIds } = useContext(
        HighlightedNodeContext,
    );
    const { onRename, onDelete, autoEditNodeId, onAutoEditConsumed } =
        useContext(NodeActionsContext);
    const current = id === currentNodeId;
    const traversed = !current && traversedNodeIds.has(id);

    const [isEditing, setIsEditing] = useState(false);
    const [draft, setDraft] = useState(data.label);
    const inputRef = useRef<HTMLInputElement>(null);

    // Enter edit mode the first render a just-created node
    const [consumedAutoEditFor, setConsumedAutoEditFor] = useState<
        string | null
    >(null);
    if (autoEditNodeId === id && consumedAutoEditFor !== id) {
        setConsumedAutoEditFor(id);
        setDraft(data.label);
        setIsEditing(true);
    }

    // Tells the canvas the auto-edit hand-off is done
    useEffect(() => {
        if (autoEditNodeId === id) onAutoEditConsumed();
    }, [autoEditNodeId, id, onAutoEditConsumed]);

    useEffect(() => {
        if (isEditing) inputRef.current?.select();
    }, [isEditing]);

    function startEditing() {
        setDraft(data.label);
        setIsEditing(true);
    }

    // onBlur passes cancelOnReject: true - blur is a low-commitment "I'm
    // done with this box" gesture (clicking another node, the canvas, a
    // toolbar button), so a rejection there should just cancel the edit
    // rather than keep re-submitting the same rejected value and refocusing
    // out from under the click, which would otherwise trap the user unable
    // to leave except via Escape. Enter is the opposite: an explicit retry
    // request, so it keeps the current (invalid) text in place to fix.
    function commitEditing(cancelOnReject = false) {
        const trimmed = draft.trim();
        if (trimmed === data.label) {
            setIsEditing(false);
            return;
        }
        // A blank draft is passed through too
        if (onRename(id, trimmed)) {
            setIsEditing(false);
        } else if (cancelOnReject) {
            cancelEditing();
        } else {
            inputRef.current?.focus();
        }
    }

    function cancelEditing() {
        setDraft(data.label);
        setIsEditing(false);
    }

    return (
        <div
            aria-current={current ? "step" : undefined}
            className={`group relative max-w-64 rounded-lg border bg-chrome px-3 py-2 text-sm font-medium break-words text-chrome-foreground shadow-sm transition-shadow hover:shadow-md ${
                current
                    ? "border-current-step ring-2 ring-current-step/30"
                    : traversed
                      ? "border-danger border-dashed ring-2 ring-danger/30"
                      : selected
                        ? "border-accent/60 ring-1 ring-accent/20"
                        : "border-border"
            }`}
        >
            {/* A dashed rather than solid border too */}
            {(current || traversed) && (
                <span className="sr-only">
                    {current
                        ? ", current simulation step"
                        : ", already traversed"}
                </span>
            )}
            <Handle type="target" position={Position.Left} />
            {isEditing ? (
                <input
                    ref={inputRef}
                    value={draft}
                    onChange={(event) => setDraft(event.target.value)}
                    onBlur={() => commitEditing(true)}
                    onKeyDown={(event) => {
                        if (event.key === "Enter") {
                            event.preventDefault();
                            commitEditing();
                        } else if (event.key === "Escape") {
                            event.preventDefault();
                            cancelEditing();
                        }
                    }}
                    onClick={(event) => event.stopPropagation()}
                    className="nodrag nopan w-full bg-transparent outline-none"
                    autoFocus
                />
            ) : (
                <span
                    onDoubleClick={(event) => {
                        event.stopPropagation();
                        startEditing();
                    }}
                >
                    {data.label}
                </span>
            )}
            <Handle type="source" position={Position.Right} />
            <button
                type="button"
                onClick={(event) => {
                    event.stopPropagation();
                    onDelete(id);
                }}
                title="Remove node"
                className="nodrag nopan absolute -top-2 -right-2 flex h-5 w-5 items-center justify-center rounded-full border border-danger bg-chrome text-danger opacity-0 shadow-sm transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
            >
                <X size={12} />
            </button>
        </div>
    );
}

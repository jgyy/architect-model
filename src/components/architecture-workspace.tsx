"use client";

import { useCallback, useMemo, useState } from "react";

import { ArchitectureCanvas } from "@/components/architecture-canvas";
import { ConsolePanel } from "@/components/console-panel";
import { MergePickerDialog } from "@/components/merge-picker-dialog";
import { SimulationPanel } from "@/components/simulation-panel";
import { useWorkspaceSession } from "@/components/use-workspace-session";
import {
    parseCommand,
    type CommandResult,
    type ParseCommandOptions,
} from "@/lib/architecture-commands";
import {
    ARCHITECTURE_EXPORT_FILENAME,
    serializeArchitecture,
} from "@/lib/architecture-io";
import {
    buildConnectCommand,
    buildMoveNodeCommand,
    buildRemoveEdgeCommand,
    buildRemoveNodeCommand,
    buildRenameNodeCommand,
    nextDefaultNodeLabel,
} from "@/lib/canvas-commands";
import { foldLabel } from "@/lib/node-reference";
import { getTraversedPath } from "@/lib/simulation";
import {
    redo as redoHistory,
    recordCommand,
    undo as undoHistory,
} from "@/lib/undo-history";
import {
    downloadJsonFile,
    nextStepIndexForSameNode,
} from "@/lib/workspace-log";
import { HELP_MESSAGE } from "@/lib/supported-commands";
import type { Architecture, ArchitectureNode } from "@/types/architecture";

/**
 * Props for {@link ArchitectureWorkspace}: the architecture to start from
 * before any persisted session loads, and to reset to on "clear history".
 */
type ArchitectureWorkspaceProps = {
    initialArchitecture: Architecture;
};

/**
 * The app's single top-level stateful screen ("use client"): owns the
 * architecture graph, command log, undo/redo history, simulation playback
 * position, and syncing to `localStorage`. Sole call site of `parseCommand`
 * - every typed command and canvas gesture runs through its `runCommand`,
 * which validates, records undo, updates the simulation, and persists.
 * Renders the canvas, console/simulation sidebar, and merge picker dialog.
 */
export function ArchitectureWorkspace({
    initialArchitecture,
}: ArchitectureWorkspaceProps) {
    const [input, setInput] = useState("");
    const {
        architecture,
        setArchitecture,
        log,
        setCurrentStepIndex,
        safeStepIndex,
        handleStepChange,
        speedIndex,
        setSpeedIndex,
        undoRedo,
        setUndoRedo,
        nodeIndex,
        logResult,
        handleClearHistory,
        pendingMerge,
        handleImportFile,
        handleMergeFile,
        handleCancelMerge,
        handleConfirmMerge,
    } = useWorkspaceSession(initialArchitecture);

    const highlightedNodeId = architecture.nodes[safeStepIndex]?.id;
    /**
     * Nodes and edges the simulation has already passed through, up to
     * `safeStepIndex`. Memoized so the canvas doesn't recompute its
     * traversed-path styling on every unrelated state change.
     */
    const traversedPath = useMemo(
        () => getTraversedPath(architecture, safeStepIndex),
        [architecture, safeStepIndex],
    );

    /**
     * Adopts a new node array from the canvas (e.g. after a drag) without
     * touching edges.
     * @param nodes - the updated node array to store
     */
    const handleNodesChange = useCallback(
        (nodes: ArchitectureNode[]) => {
            setArchitecture((current) => ({ ...current, nodes }));
        },
        [setArchitecture],
    );

    /**
     * Runs one command line the same way whether typed into the console or
     * synthesized from a canvas gesture - the app's single entry point for
     * every mutation and sole call site of `parseCommand`. Handles `help`,
     * `export`, `undo`, and `redo` directly since they're non-mutating or
     * act on history; every other command goes through `parseCommand` and,
     * on success, is recorded onto the two-stack undo/redo history (undo
     * pops an entry and pushes its inverse onto redo; a new command clears
     * the redo stack) before the architecture state updates. Every outcome
     * is logged.
     * @param text - raw command text to run
     * @param options - forwarded to `parseCommand` (e.g. drop position for
     * a canvas-created node)
     * @returns the `CommandResult` discriminated union describing the
     * outcome, or null if `text` was blank
     */
    const runCommand = useCallback(
        (text: string, options?: ParseCommandOptions): CommandResult | null => {
            const trimmed = text.trim();
            if (!trimmed) return null;

            // help/export/undo/redo are non-mutating or history operations
            const lower = trimmed.toLowerCase();

            if (lower === "help" || trimmed === "?") {
                logResult(trimmed, true, HELP_MESSAGE);
                return { ok: true, architecture, message: HELP_MESSAGE };
            }

            if (lower === "export") {
                downloadJsonFile(
                    serializeArchitecture(architecture),
                    ARCHITECTURE_EXPORT_FILENAME,
                );
                const message = `Exported ${architecture.nodes.length} node(s) and ${architecture.edges.length} edge(s) to "${ARCHITECTURE_EXPORT_FILENAME}".`;
                logResult(trimmed, true, message);
                return { ok: true, architecture, message };
            }

            if (lower === "undo" || lower === "redo") {
                const outcome =
                    lower === "undo"
                        ? undoHistory(undoRedo, architecture)
                        : redoHistory(undoRedo, architecture);
                if (!outcome.ok) {
                    const message = `Nothing to ${lower}.`;
                    logResult(trimmed, false, message);
                    return { ok: false, message };
                }
                setCurrentStepIndex((index) =>
                    nextStepIndexForSameNode(
                        architecture,
                        index,
                        outcome.architecture,
                    ),
                );
                setArchitecture(outcome.architecture);
                setUndoRedo(outcome.state);
                const message = `${lower === "undo" ? "Undid" : "Redid"} "${outcome.command}".`;
                logResult(trimmed, true, message);
                return {
                    ok: true,
                    architecture: outcome.architecture,
                    message,
                };
            }

            const result = parseCommand(
                trimmed,
                architecture,
                options,
                nodeIndex,
            );
            if (result.ok) {
                setUndoRedo((current) =>
                    recordCommand(current, trimmed, architecture),
                );
                setCurrentStepIndex((index) =>
                    nextStepIndexForSameNode(
                        architecture,
                        index,
                        result.architecture,
                    ),
                );
                setArchitecture(result.architecture);
            }
            logResult(trimmed, result.ok, result.message);
            return result;
        },
        [
            architecture,
            nodeIndex,
            undoRedo,
            logResult,
            setArchitecture,
            setCurrentStepIndex,
            setUndoRedo,
        ],
    );

    /**
     * Wires the console's input form to `runCommand`: runs the input and
     * clears the box, ignoring blank/whitespace-only submits.
     * @param event - the form's submit event
     */
    function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
        event.preventDefault();
        if (!input.trim()) return;
        runCommand(input);
        setInput("");
    }

    /**
     * Handles deleting an edge on the canvas: synthesizes and runs the same
     * "remove edge" command text a typed instruction would produce, so
     * gestures and typed commands share one validated, undo-able path.
     * @param edgeId - id of the edge to remove
     */
    const handleEdgeDelete = useCallback(
        (edgeId: string) => {
            const command = buildRemoveEdgeCommand(edgeId, architecture);
            if (command) runCommand(command);
        },
        [architecture, runCommand],
    );

    /**
     * Handles connecting two nodes by canvas drag: synthesizes and runs
     * the equivalent "connect" command text.
     * @param sourceId - node the drag started from
     * @param targetId - node the drag ended on
     */
    const handleEdgeCreate = useCallback(
        (sourceId: string, targetId: string) => {
            const command = buildConnectCommand(
                sourceId,
                targetId,
                architecture,
            );
            if (command) runCommand(command);
        },
        [architecture, runCommand],
    );

    /**
     * Handles renaming a node inline on the canvas via the "rename"
     * command.
     * @param nodeId - id of the node being renamed
     * @param newLabel - label text entered
     * @returns whether it succeeded (false e.g. on a duplicate label)
     */
    const handleNodeRename = useCallback(
        (nodeId: string, newLabel: string): boolean => {
            const command = buildRenameNodeCommand(
                nodeId,
                newLabel,
                architecture,
            );
            if (!command) return false;
            return runCommand(command)?.ok ?? false;
        },
        [architecture, runCommand],
    );

    /**
     * Handles deleting a node on the canvas via the "remove node" command.
     * @param nodeId - id of the node to remove
     */
    const handleNodeDelete = useCallback(
        (nodeId: string) => {
            const command = buildRemoveNodeCommand(nodeId, architecture);
            if (command) runCommand(command);
        },
        [architecture, runCommand],
    );

    /**
     * Handles dragging a node to a new position in the simulation panel's
     * step list via the "move node" command. `runCommand` keeps the
     * current step pointing at the same node across the reorder.
     * @param nodeId - id of the node being reordered
     * @param toIndex - zero-based drop position
     */
    const handleStepReorder = useCallback(
        (nodeId: string, toIndex: number) => {
            // runCommand itself keeps the current step's identity stable
            const command = buildMoveNodeCommand(
                nodeId,
                toIndex + 1,
                architecture,
            );
            if (command) runCommand(command);
        },
        [architecture, runCommand],
    );

    /**
     * Handles creating a node via double-click: generates the next default
     * label and runs "add node" with the drop position attached.
     * @param position - canvas coordinates for the new node
     * @returns the new node's id, or null if the command failed
     */
    const handleNodeCreate = useCallback(
        (position: { x: number; y: number }): string | null => {
            const label = nextDefaultNodeLabel(architecture);
            const result = runCommand(`add node ${label}`, { position });
            return result?.ok
                ? (result.architecture.nodes.at(-1)?.id ?? null)
                : null;
        },
        [architecture, runCommand],
    );

    return (
        <div className="flex h-full w-full flex-col md:flex-row">
            <div className="min-h-0 min-w-0 flex-1">
                <ArchitectureCanvas
                    architecture={architecture}
                    highlightedNodeId={highlightedNodeId}
                    traversedNodeIds={traversedPath.nodeIds}
                    traversedEdgeIds={traversedPath.edgeIds}
                    onNodesChange={handleNodesChange}
                    onNodeCreate={handleNodeCreate}
                    onNodeRename={handleNodeRename}
                    onNodeDelete={handleNodeDelete}
                    onEdgeCreate={handleEdgeCreate}
                    onEdgeDelete={handleEdgeDelete}
                />
            </div>
            <aside className="flex h-[45vh] w-full shrink-0 flex-col border-t border-border bg-chrome font-mono text-sm md:h-auto md:w-[80ch] md:max-w-[min(80ch,70vw)] md:border-t-0 md:border-l">
                {architecture.nodes.length > 0 && (
                    <SimulationPanel
                        architecture={architecture}
                        currentStepIndex={safeStepIndex}
                        onStepChange={handleStepChange}
                        speedIndex={speedIndex}
                        onSpeedChange={setSpeedIndex}
                        onReorder={handleStepReorder}
                    />
                )}
                <ConsolePanel
                    log={log}
                    onClear={handleClearHistory}
                    input={input}
                    onInputChange={setInput}
                    onSubmit={handleSubmit}
                    architecture={architecture}
                    nodeIndex={nodeIndex}
                    canUndo={undoRedo.undoStack.length > 0}
                    canRedo={undoRedo.redoStack.length > 0}
                    onUndo={() => runCommand("undo")}
                    onRedo={() => runCommand("redo")}
                    onExport={() => runCommand("export")}
                    onImport={handleImportFile}
                    onMerge={handleMergeFile}
                />
            </aside>
            {pendingMerge && (
                <MergePickerDialog
                    key={pendingMerge.key}
                    fileName={pendingMerge.fileName}
                    incoming={pendingMerge.incoming}
                    current={architecture}
                    existingFoldedLabels={
                        new Set(
                            architecture.nodes.map((node) =>
                                foldLabel(node.data.label),
                            ),
                        )
                    }
                    onConfirm={handleConfirmMerge}
                    onCancel={handleCancelMerge}
                />
            )}
        </div>
    );
}

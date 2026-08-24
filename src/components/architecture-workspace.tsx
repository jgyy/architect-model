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
 * Seed architecture; also the reset target for "clear history".
 */
type ArchitectureWorkspaceProps = {
    initialArchitecture: Architecture;
};

/**
 * Top-level stateful screen: owns architecture, undo/redo, and simulation
 * state; sole call site of `parseCommand`.
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
     * Nodes/edges traversed up to `safeStepIndex`; memoized for perf.
     */
    const traversedPath = useMemo(
        () => getTraversedPath(architecture, safeStepIndex),
        [architecture, safeStepIndex],
    );

    /**
     * Adopts nodes from a canvas drag; leaves edges untouched.
     */
    const handleNodesChange = useCallback(
        (nodes: ArchitectureNode[]) => {
            setArchitecture((current) => ({ ...current, nodes }));
        },
        [setArchitecture],
    );

    /**
     * Single entry point for every mutation, typed or canvas-triggered.
     * `help`/`export`/`undo`/`redo` run directly; other commands go through
     * `parseCommand` and push onto undo history on success (clearing redo).
     * @param text - command text
     * @param options - forwarded to `parseCommand`
     * @returns `CommandResult`, or null if blank
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
     * Runs input via `runCommand`, clears box; ignores blank submits.
     */
    function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
        event.preventDefault();
        if (!input.trim()) return;
        runCommand(input);
        setInput("");
    }

    /**
     * Deletes an edge via the equivalent "remove edge" command text.
     */
    const handleEdgeDelete = useCallback(
        (edgeId: string) => {
            const command = buildRemoveEdgeCommand(edgeId, architecture);
            if (command) runCommand(command);
        },
        [architecture, runCommand],
    );

    /**
     * Connects two nodes via the equivalent "connect" command text.
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
     * Renames a node inline via the "rename" command.
     * @returns false e.g. on a duplicate label
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
     * Deletes a node via the "remove node" command.
     */
    const handleNodeDelete = useCallback(
        (nodeId: string) => {
            const command = buildRemoveNodeCommand(nodeId, architecture);
            if (command) runCommand(command);
        },
        [architecture, runCommand],
    );

    /**
     * Reorders via "move node"; `runCommand` pins the step to the same node.
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
     * Creates a node via double-click with a default label at the drop position.
     * @returns new node id, or null on failure
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

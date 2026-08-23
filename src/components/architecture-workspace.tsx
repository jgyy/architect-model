"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { ArchitectureCanvas } from "@/components/architecture-canvas";
import { ConsolePanel } from "@/components/console-panel";
import { MergePickerDialog } from "@/components/merge-picker-dialog";
import { SimulationPanel } from "@/components/simulation-panel";
import {
    buildNodeIndex,
    parseCommand,
    type CommandResult,
    type ParseCommandOptions,
} from "@/lib/architecture-commands";
import {
    ARCHITECTURE_EXPORT_FILENAME,
    mergeSelectedArchitecture,
    parseImportedArchitecture,
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
import {
    clearPersistedState,
    interpretStorageEvent,
    loadPersistedState,
    savePersistedState,
    type LogEntry,
    type PersistedState,
} from "@/lib/persistence";
import {
    DEFAULT_SPEED_INDEX,
    clampStepIndex,
    getTraversedPath,
} from "@/lib/simulation";
import { HELP_MESSAGE } from "@/lib/supported-commands";
import {
    EMPTY_UNDO_REDO_STATE,
    recordCommand,
    redo as redoHistory,
    undo as undoHistory,
    type UndoRedoState,
} from "@/lib/undo-history";
import type { Architecture, ArchitectureNode } from "@/types/architecture";

// A plain loop (not Math.max(...ids))
function maxLogId(entries: LogEntry[]): number {
    let max = 0;
    for (const entry of entries) {
        if (entry.id > max) max = entry.id;
    }
    return max;
}

// Bounds the console's scrollback
const MAX_LOG_ENTRIES = 5000;

// A Blob + temporary <a download> is the standard no-backend way to hand the browser
function downloadJsonFile(json: string, filename: string): void {
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
}

function appendLogEntry(entries: LogEntry[], entry: LogEntry): LogEntry[] {
    const next = [...entries, entry];
    return next.length > MAX_LOG_ENTRIES
        ? next.slice(next.length - MAX_LOG_ENTRIES)
        : next;
}

// Keeps the simulation's "current" step pointing at the same node
function nextStepIndexForSameNode(
    before: Architecture,
    stepIndex: number,
    after: Architecture,
): number {
    const currentNodeId = before.nodes[stepIndex]?.id;
    if (!currentNodeId) return stepIndex;
    const newIndex = after.nodes.findIndex((node) => node.id === currentNodeId);
    return newIndex === -1 ? stepIndex : newIndex;
}

type ArchitectureWorkspaceProps = {
    initialArchitecture: Architecture;
};

export function ArchitectureWorkspace({
    initialArchitecture,
}: ArchitectureWorkspaceProps) {
    const [architecture, setArchitecture] = useState(initialArchitecture);
    const [input, setInput] = useState("");
    const [log, setLog] = useState<LogEntry[]>([]);
    const [currentStepIndex, setCurrentStepIndex] = useState(0);
    const [speedIndex, setSpeedIndex] = useState(DEFAULT_SPEED_INDEX);
    const [hydrated, setHydrated] = useState(false);
    // Ephemeral, per-tab command history for undo/redo
    const [undoRedo, setUndoRedo] = useState<UndoRedoState>(
        EMPTY_UNDO_REDO_STATE,
    );
    // A merge file that's been parsed but not yet confirmed via the picker.
    const [pendingMerge, setPendingMerge] = useState<{
        key: number;
        fileName: string;
        incoming: Architecture;
    } | null>(null);
    const nextMergeKeyRef = useRef(1);
    // Tracks the JSON we know is in localStorage
    const lastPersistedRef = useRef<string | null>(null);
    // This tab's own latest known-good state, kept alongside lastPersistedRef
    const latestStateRef = useRef<PersistedState | null>(null);
    // Next id to hand out via nextLogId()
    const nextLogIdRef = useRef(1);

    const applyPersisted = useCallback((state: PersistedState) => {
        setArchitecture(state.architecture);
        setLog(state.log);
        setCurrentStepIndex(state.stepIndex);
        setSpeedIndex(state.speedIndex);
        setUndoRedo(EMPTY_UNDO_REDO_STATE);
        nextLogIdRef.current = maxLogId(state.log) + 1;
    }, []);

    const resetToInitial = useCallback(() => {
        applyPersisted({
            architecture: initialArchitecture,
            log: [],
            stepIndex: 0,
            speedIndex: DEFAULT_SPEED_INDEX,
        });
    }, [applyPersisted, initialArchitecture]);

    function nextLogId(): number {
        const id = nextLogIdRef.current;
        nextLogIdRef.current += 1;
        return id;
    }

    // Every logged command allocates its id and appends in one step.
    const logResult = useCallback(
        (input: string, ok: boolean, message: string) => {
            const id = nextLogId();
            setLog((entries) =>
                appendLogEntry(entries, { id, input, ok, message }),
            );
        },
        [],
    );

    /* eslint-disable react-hooks/set-state-in-effect */
    useEffect(() => {
        const persisted = loadPersistedState(window.localStorage);
        if (persisted) {
            applyPersisted(persisted);
            // Matches the shape the autosave effect below will independently
            lastPersistedRef.current = JSON.stringify(persisted);
        }
        setHydrated(true);
    }, [applyPersisted]);
    /* eslint-enable react-hooks/set-state-in-effect */

    // Reacts to storage changes made by *other* tabs
    useEffect(() => {
        function cancelStalePendingMerge() {
            // The merge picker's selection/added-edges
            if (!pendingMerge) return;
            setPendingMerge(null);
            logResult(
                `merge "${pendingMerge.fileName}"`,
                false,
                "Cancelled: the architecture changed in another tab while the merge picker was open.",
            );
        }
        function handleStorage(event: StorageEvent) {
            const change = interpretStorageEvent(event.key, event.newValue);
            if (change.type === "updated") {
                lastPersistedRef.current = event.newValue;
                applyPersisted(change.state);
                cancelStalePendingMerge();
            } else if (change.type === "cleared") {
                lastPersistedRef.current = null;
                resetToInitial();
                cancelStalePendingMerge();
            } else if (change.type === "invalid" && latestStateRef.current) {
                // Something unreadable landed in storage
                savePersistedState(window.localStorage, latestStateRef.current);
                lastPersistedRef.current = JSON.stringify(
                    latestStateRef.current,
                );
            }
        }
        window.addEventListener("storage", handleStorage);
        return () => window.removeEventListener("storage", handleStorage);
    }, [applyPersisted, resetToInitial, pendingMerge, logResult]);

    // a remove-node command can shrink the simulation trace out from under it
    const safeStepIndex = clampStepIndex(
        currentStepIndex,
        architecture.nodes.length,
    );

    // Whether the user has already been warned this "outage"
    const persistenceWarnedRef = useRef(false);

    useEffect(() => {
        if (!hydrated) return;
        const nextState: PersistedState = {
            architecture,
            log,
            stepIndex: safeStepIndex,
            speedIndex,
        };
        latestStateRef.current = nextState;
        const raw = JSON.stringify(nextState);
        if (raw === lastPersistedRef.current) return;
        if (savePersistedState(window.localStorage, nextState)) {
            lastPersistedRef.current = raw;
            persistenceWarnedRef.current = false;
        } else if (!persistenceWarnedRef.current) {
            persistenceWarnedRef.current = true;
            logResult(
                "(autosave)",
                false,
                "Couldn't save to this browser's local storage (it may be full, or you're in private browsing) - your changes may not survive closing this tab.",
            );
        }
    }, [architecture, log, safeStepIndex, speedIndex, hydrated, logResult]);

    function handleClearHistory() {
        const cleared = clearPersistedState(window.localStorage);
        lastPersistedRef.current = null;
        resetToInitial();
        if (!cleared) {
            logResult(
                "(clear console)",
                false,
                "Couldn't clear this browser's local storage - the previous session may reappear after a reload.",
            );
        }
    }

    const highlightedNodeId = architecture.nodes[safeStepIndex]?.id;
    const traversedPath = useMemo(
        () => getTraversedPath(architecture, safeStepIndex),
        [architecture, safeStepIndex],
    );

    // Stable across unrelated re-renders (e.g. every command-input keystroke)
    const handleStepChange = useCallback(
        (index: number) => {
            setCurrentStepIndex(
                clampStepIndex(index, architecture.nodes.length),
            );
        },
        [architecture.nodes.length],
    );

    // Stable across unrelated re-renders, same reason as handleStepChange
    const handleNodesChange = useCallback((nodes: ArchitectureNode[]) => {
        setArchitecture((current) => ({ ...current, nodes }));
    }, []);

    // Node lookups (by label, id-collision check) and edge connectivity lookups
    const nodeIndex = useMemo(
        () => buildNodeIndex(architecture.nodes, architecture.edges),
        [architecture.nodes, architecture.edges],
    );

    // Runs a command line exactly the same way whether it was typed
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
        [architecture, nodeIndex, undoRedo, logResult],
    );

    function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
        event.preventDefault();
        if (!input.trim()) return;
        runCommand(input);
        setInput("");
    }

    const handleEdgeDelete = useCallback(
        (edgeId: string) => {
            const command = buildRemoveEdgeCommand(edgeId, architecture);
            if (command) runCommand(command);
        },
        [architecture, runCommand],
    );

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

    const handleNodeDelete = useCallback(
        (nodeId: string) => {
            const command = buildRemoveNodeCommand(nodeId, architecture);
            if (command) runCommand(command);
        },
        [architecture, runCommand],
    );

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

    // A whole-architecture replacement, so it's recorded like any other
    const handleImportFile = useCallback(
        (file: File) => {
            const label = `import "${file.name}"`;
            file.text()
                .then((raw) => {
                    const result = parseImportedArchitecture(raw);
                    if (!result.ok) {
                        logResult(label, false, result.message);
                        return;
                    }
                    setUndoRedo((current) =>
                        recordCommand(current, label, architecture),
                    );
                    // A whole-architecture replacement has no "current node"
                    setCurrentStepIndex(0);
                    setArchitecture(result.architecture);
                    logResult(
                        label,
                        true,
                        `Imported ${result.nodeCount} node(s) and ${result.edgeCount} edge(s) from "${file.name}".`,
                    );
                })
                .catch(() => {
                    logResult(label, false, "Couldn't read that file.");
                });
        },
        [architecture, logResult],
    );

    // Only parses and opens the picker; the actual merge happens on confirm
    const handleMergeFile = useCallback(
        (file: File) => {
            file.text()
                .then((raw) => {
                    const parsed = parseImportedArchitecture(raw);
                    if (!parsed.ok) {
                        logResult(
                            `merge "${file.name}"`,
                            false,
                            parsed.message,
                        );
                        return;
                    }
                    setPendingMerge({
                        key: nextMergeKeyRef.current++,
                        fileName: file.name,
                        incoming: parsed.architecture,
                    });
                })
                .catch(() => {
                    logResult(
                        `merge "${file.name}"`,
                        false,
                        "Couldn't read that file.",
                    );
                });
        },
        [logResult],
    );

    const handleCancelMerge = useCallback(() => setPendingMerge(null), []);

    const handleConfirmMerge = useCallback(
        (
            selectedNodeIds: Set<string>,
            excludedEdgeIds: Set<string>,
            addedEdges: { source: string; target: string }[],
            insertAtStep: number,
        ) => {
            if (!pendingMerge) return;
            const label = `merge "${pendingMerge.fileName}"`;
            const result = mergeSelectedArchitecture(
                architecture,
                pendingMerge.incoming,
                selectedNodeIds,
                excludedEdgeIds,
                addedEdges,
                insertAtStep,
            );
            setUndoRedo((current) =>
                recordCommand(current, label, architecture),
            );
            setCurrentStepIndex((index) =>
                nextStepIndexForSameNode(
                    architecture,
                    index,
                    result.architecture,
                ),
            );
            setArchitecture(result.architecture);
            const totalAvailable = pendingMerge.incoming.nodes.length;
            const countPhrase =
                result.nodeCount === totalAvailable
                    ? `${result.nodeCount} node(s)`
                    : `${result.nodeCount} of ${totalAvailable} node(s)`;
            const placement =
                insertAtStep === architecture.nodes.length
                    ? ""
                    : ` at step ${insertAtStep + 1}`;
            const base = `Merged ${countPhrase} and ${result.edgeCount} edge(s) from "${pendingMerge.fileName}" into the existing architecture${placement}.`;
            const message = result.renamedLabels.length
                ? `${base} Renamed to avoid duplicates: ${result.renamedLabels.join(", ")}.`
                : base;
            logResult(label, true, message);
            setPendingMerge(null);
        },
        [architecture, pendingMerge, logResult],
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

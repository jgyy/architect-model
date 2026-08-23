"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { ArchitectureCanvas } from "@/components/architecture-canvas";
import { ConsolePanel } from "@/components/console-panel";
import { SimulationPanel } from "@/components/simulation-panel";
import {
    buildNodeIndex,
    parseCommand,
    type CommandResult,
    type ParseCommandOptions,
} from "@/lib/architecture-commands";
import {
    ARCHITECTURE_EXPORT_FILENAME,
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

// A Blob + temporary <a download> is the standard no-backend way to hand the
// browser a file to save; the object URL only needs to live long enough for
// the synchronous click() below to pick it up
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
    // Ephemeral, per-tab command history for undo/redo - not persisted, and
    // cleared whenever the architecture changes from outside runCommand
    // (hydration, a cross-tab sync, or "Clear history"), since a stack of
    // snapshots from one architecture stops making sense against another.
    const [undoRedo, setUndoRedo] = useState<UndoRedoState>(
        EMPTY_UNDO_REDO_STATE,
    );
    // Tracks the JSON we know is in localStorage
    const lastPersistedRef = useRef<string | null>(null);
    // This tab's own latest known-good state, kept alongside lastPersistedRef
    // so an invalid write from elsewhere (e.g. another tab, a stale schema)
    // can be overwritten with something valid instead of sitting there to
    // trip up the next reload
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
        setArchitecture(initialArchitecture);
        setLog([]);
        setCurrentStepIndex(0);
        setSpeedIndex(DEFAULT_SPEED_INDEX);
        setUndoRedo(EMPTY_UNDO_REDO_STATE);
        nextLogIdRef.current = 1;
    }, [initialArchitecture]);

    function nextLogId(): number {
        const id = nextLogIdRef.current;
        nextLogIdRef.current += 1;
        return id;
    }

    // localStorage doesn't exist during SSR
    /* eslint-disable react-hooks/set-state-in-effect */
    useEffect(() => {
        const persisted = loadPersistedState(window.localStorage);
        if (persisted) {
            applyPersisted(persisted);
            // Matches the shape the autosave effect below will independently
            // recompute on its very next run, so that run correctly no-ops
            // instead of writing back the exact state we just read
            lastPersistedRef.current = JSON.stringify(persisted);
        }
        setHydrated(true);
    }, [applyPersisted]);
    /* eslint-enable react-hooks/set-state-in-effect */

    // Reacts to storage changes made by *other* tabs
    useEffect(() => {
        function handleStorage(event: StorageEvent) {
            const change = interpretStorageEvent(event.key, event.newValue);
            if (change.type === "updated") {
                lastPersistedRef.current = event.newValue;
                applyPersisted(change.state);
            } else if (change.type === "cleared") {
                lastPersistedRef.current = null;
                resetToInitial();
            } else if (change.type === "invalid" && latestStateRef.current) {
                // Something unreadable landed in storage (e.g. another tab
                // mid-write, a stale/foreign schema). Leave this tab's UI
                // alone and overwrite it with our own known-good state so a
                // later reload doesn't fall back to initialArchitecture.
                savePersistedState(window.localStorage, latestStateRef.current);
                lastPersistedRef.current = JSON.stringify(
                    latestStateRef.current,
                );
            }
        }
        window.addEventListener("storage", handleStorage);
        return () => window.removeEventListener("storage", handleStorage);
    }, [applyPersisted, resetToInitial]);

    // a remove-node command can shrink the simulation trace out from under it
    const safeStepIndex = clampStepIndex(
        currentStepIndex,
        architecture.nodes.length,
    );

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
        savePersistedState(window.localStorage, nextState);
        lastPersistedRef.current = raw;
    }, [architecture, log, safeStepIndex, speedIndex, hydrated]);

    function handleClearHistory() {
        clearPersistedState(window.localStorage);
        lastPersistedRef.current = null;
        resetToInitial();
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

            // help/export/undo/redo are non-mutating or history operations,
            // not architecture-mutating regex commands - they never reach
            // parseCommand
            const lower = trimmed.toLowerCase();

            if (lower === "help" || trimmed === "?") {
                const id = nextLogId();
                setLog((entries) =>
                    appendLogEntry(entries, {
                        id,
                        input: trimmed,
                        ok: true,
                        message: HELP_MESSAGE,
                    }),
                );
                return { ok: true, architecture, message: HELP_MESSAGE };
            }

            if (lower === "export") {
                downloadJsonFile(
                    serializeArchitecture(architecture),
                    ARCHITECTURE_EXPORT_FILENAME,
                );
                const id = nextLogId();
                const message = `Exported ${architecture.nodes.length} node(s) and ${architecture.edges.length} edge(s) to "${ARCHITECTURE_EXPORT_FILENAME}".`;
                setLog((entries) =>
                    appendLogEntry(entries, {
                        id,
                        input: trimmed,
                        ok: true,
                        message,
                    }),
                );
                return { ok: true, architecture, message };
            }

            if (lower === "undo" || lower === "redo") {
                const outcome =
                    lower === "undo"
                        ? undoHistory(undoRedo, architecture)
                        : redoHistory(undoRedo, architecture);
                const id = nextLogId();
                if (!outcome.ok) {
                    const message = `Nothing to ${lower}.`;
                    setLog((entries) =>
                        appendLogEntry(entries, {
                            id,
                            input: trimmed,
                            ok: false,
                            message,
                        }),
                    );
                    return { ok: false, message };
                }
                setArchitecture(outcome.architecture);
                setUndoRedo(outcome.state);
                const message = `${lower === "undo" ? "Undid" : "Redid"} "${outcome.command}".`;
                setLog((entries) =>
                    appendLogEntry(entries, {
                        id,
                        input: trimmed,
                        ok: true,
                        message,
                    }),
                );
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
                setArchitecture(result.architecture);
            }
            const id = nextLogId();
            setLog((entries) =>
                appendLogEntry(entries, {
                    id,
                    input: trimmed,
                    ok: result.ok,
                    message: result.message,
                }),
            );
            return result;
        },
        [architecture, nodeIndex, undoRedo],
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
            // Reordering shifts every node between the old and new position,
            // so whichever node the user was currently on may no longer sit
            // at the same index - follow it, rather than letting "current"
            // silently jump to a different node purely because it shifted
            // into that slot
            const currentNodeId = architecture.nodes[safeStepIndex]?.id;
            const command = buildMoveNodeCommand(
                nodeId,
                toIndex + 1,
                architecture,
            );
            if (!command) return;
            const result = runCommand(command);
            if (!result?.ok || !currentNodeId) return;
            const newIndex = result.architecture.nodes.findIndex(
                (node) => node.id === currentNodeId,
            );
            if (newIndex !== -1 && newIndex !== safeStepIndex) {
                setCurrentStepIndex(newIndex);
            }
        },
        [architecture, safeStepIndex, runCommand],
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
    // mutating command (undoable) rather than treated as a persisted-state
    // hydration - unlike undo/redo, reading the file is async, so this can't
    // go through runCommand's synchronous, single-return-value shape
    const handleImportFile = useCallback(
        (file: File) => {
            const label = `import "${file.name}"`;
            file.text()
                .then((raw) => {
                    const result = parseImportedArchitecture(raw);
                    const id = nextLogId();
                    if (!result.ok) {
                        setLog((entries) =>
                            appendLogEntry(entries, {
                                id,
                                input: label,
                                ok: false,
                                message: result.message,
                            }),
                        );
                        return;
                    }
                    setUndoRedo((current) =>
                        recordCommand(current, label, architecture),
                    );
                    setArchitecture(result.architecture);
                    setLog((entries) =>
                        appendLogEntry(entries, {
                            id,
                            input: label,
                            ok: true,
                            message: `Imported ${result.nodeCount} node(s) and ${result.edgeCount} edge(s) from "${file.name}".`,
                        }),
                    );
                })
                .catch(() => {
                    const id = nextLogId();
                    setLog((entries) =>
                        appendLogEntry(entries, {
                            id,
                            input: label,
                            ok: false,
                            message: "Couldn't read that file.",
                        }),
                    );
                });
        },
        [architecture],
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
                    canUndo={undoRedo.undoStack.length > 0}
                    canRedo={undoRedo.redoStack.length > 0}
                    onUndo={() => runCommand("undo")}
                    onRedo={() => runCommand("redo")}
                    onExport={() => runCommand("export")}
                    onImport={handleImportFile}
                />
            </aside>
        </div>
    );
}

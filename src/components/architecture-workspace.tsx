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

/**
 * Highest `id` used across `entries`, so `nextLogIdRef` can resume without
 * colliding with restored ids. Uses a plain loop rather than
 * `Math.max(...ids)` to avoid a stack overflow on a log near
 * {@link MAX_LOG_ENTRIES}.
 * @param entries - the log entries to scan
 * @returns the largest `id` found, or 0 if empty
 */
function maxLogId(entries: LogEntry[]): number {
    let max = 0;
    for (const entry of entries) {
        if (entry.id > max) max = entry.id;
    }
    return max;
}

/**
 * Max entries the command log keeps at once, so console scrollback and the
 * autosaved JSON don't grow without limit.
 */
const MAX_LOG_ENTRIES = 5000;

/**
 * Triggers a browser download of `json` as `filename`, used by the "export"
 * command. Uses a `Blob` plus a temporary, auto-clicked `<a download>` -
 * this app has no server to serve the export from.
 * @param json - file contents to download
 * @param filename - suggested filename for the save dialog
 */
function downloadJsonFile(json: string, filename: string): void {
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
}

/**
 * Appends one entry to the log, trimming from the front once it exceeds
 * {@link MAX_LOG_ENTRIES}.
 * @param entries - the current log
 * @param entry - entry to append
 * @returns the updated, length-capped log
 */
function appendLogEntry(entries: LogEntry[], entry: LogEntry): LogEntry[] {
    const next = [...entries, entry];
    return next.length > MAX_LOG_ENTRIES
        ? next.slice(next.length - MAX_LOG_ENTRIES)
        : next;
}

/**
 * Recomputes the step index so it still points at the same node after a
 * command changes the architecture (e.g. undo/redo, or a merge that inserts
 * nodes earlier in the trace). Falls back to `stepIndex` if that node no
 * longer exists in `after`.
 * @param before - architecture before the change
 * @param stepIndex - step index before the change
 * @param after - architecture after the change
 * @returns the index of the same node in `after`, or `stepIndex` if gone
 */
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

    /**
     * Replaces the visible session with `state` (architecture, log, step,
     * speed). Used for initial hydration and for adopting changes from
     * another tab. Undo/redo resets to empty (it's ephemeral, per-tab, not
     * persisted), and the log id counter fast-forwards past `state`'s ids.
     * @param state - the full session snapshot to adopt
     */
    const applyPersisted = useCallback((state: PersistedState) => {
        setArchitecture(state.architecture);
        setLog(state.log);
        setCurrentStepIndex(state.stepIndex);
        setSpeedIndex(state.speedIndex);
        setUndoRedo(EMPTY_UNDO_REDO_STATE);
        nextLogIdRef.current = maxLogId(state.log) + 1;
    }, []);

    /**
     * Discards the current session and starts over from
     * `initialArchitecture` with an empty log, as if nothing was persisted.
     * Used when storage is cleared, by this tab or another.
     */
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

    /**
     * Appends one outcome to the command log: allocates its id and appends
     * in one step. Every submitted command, typed or from a canvas gesture,
     * is recorded with whether it succeeded and why - the log doubles as
     * this app's validation UI.
     * @param input - the command text that was run
     * @param ok - whether it succeeded
     * @param message - human-readable outcome to display
     */
    const logResult = useCallback(
        (input: string, ok: boolean, message: string) => {
            const id = nextLogId();
            setLog((entries) =>
                appendLogEntry(entries, { id, input, ok, message }),
            );
        },
        [],
    );

    /**
     * Runs once on mount to hydrate the session from `localStorage`, if a
     * previous one was saved. Deferred to an effect since `localStorage`
     * isn't available during server rendering; `hydrated` gates the
     * autosave effect below until this initial read has run.
     */
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

    /**
     * Reacts to storage changes made by *other* tabs, so every open tab
     * converges on the same session: adopts updates, resets on a clear, and
     * repairs storage if something unreadable landed there. The `storage`
     * event only fires in other tabs - this tab's own writes are already
     * reflected.
     */
    useEffect(() => {
        /**
         * Drops a merge mid-review in the picker dialog: its selections
         * and added edges were computed against an architecture that's now
         * stale (another tab changed it).
         */
        function cancelStalePendingMerge() {
            if (!pendingMerge) return;
            setPendingMerge(null);
            logResult(
                `merge "${pendingMerge.fileName}"`,
                false,
                "Cancelled: the architecture changed in another tab while the merge picker was open.",
            );
        }
        /**
         * Classifies and applies one `storage` event: adopts another tab's
         * update, resets on a clear, or - if the write doesn't parse -
         * overwrites storage with this tab's last known-good state so the
         * corruption doesn't keep propagating.
         * @param event - the browser `storage` event to react to
         */
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

    /**
     * The step index actually safe to render/look up this render, clamped
     * into the current trace's bounds. Needed because `currentStepIndex`
     * can point past the trace's end after a command shrinks it (e.g.
     * remove node).
     */
    const safeStepIndex = clampStepIndex(
        currentStepIndex,
        architecture.nodes.length,
    );

    // Whether the user has already been warned this "outage"
    const persistenceWarnedRef = useRef(false);

    /**
     * Persists the session to `localStorage` whenever architecture, log,
     * step, or speed change, so a refresh or new tab resumes where this one
     * left off. Skips writing if serialized state is unchanged (avoids
     * redundant `storage` events elsewhere), and logs once per failure
     * streak if storage fails (e.g. full, private browsing).
     */
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

    /**
     * Handles the console's "clear history" action: wipes the persisted
     * session and resets visible state to `initialArchitecture` regardless
     * of whether the storage removal succeeded, logging a warning only if
     * the old session might reappear on reload.
     */
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
     * Updates the current step from the simulation panel's scrubber/
     * controls, clamped to the trace's bounds. Memoized so its identity
     * stays stable across unrelated re-renders (e.g. input keystrokes).
     * @param index - step index to move to
     */
    const handleStepChange = useCallback(
        (index: number) => {
            setCurrentStepIndex(
                clampStepIndex(index, architecture.nodes.length),
            );
        },
        [architecture.nodes.length],
    );

    /**
     * Adopts a new node array from the canvas (e.g. after a drag) without
     * touching edges. Stable across re-renders, same reason as
     * `handleStepChange`.
     * @param nodes - the updated node array to store
     */
    const handleNodesChange = useCallback((nodes: ArchitectureNode[]) => {
        setArchitecture((current) => ({ ...current, nodes }));
    }, []);

    /**
     * Map/Set-backed index over the architecture: node lookups by label
     * (resolving a command's typed reference) and by id (collision checks),
     * plus edge connectivity. Rebuilt via `useMemo` only when nodes/edges
     * change, and passed into `parseCommand` to avoid re-deriving it.
     */
    const nodeIndex = useMemo(
        () => buildNodeIndex(architecture.nodes, architecture.edges),
        [architecture.nodes, architecture.edges],
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
        [architecture, nodeIndex, undoRedo, logResult],
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

    /**
     * Handles importing a file as a full replacement of the architecture:
     * reads, validates, and on success swaps it in wholesale. Bypasses
     * `parseCommand` but is still recorded onto undo history.
     * @param file - the file selected or dropped to import
     */
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

    /**
     * First half of merging a file: reads and validates it, then stashes
     * the result as `pendingMerge` to open the merge picker. The actual
     * merge happens on confirm, in `handleConfirmMerge`.
     * @param file - the file selected or dropped to merge
     */
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

    /**
     * Handles the merge picker's "confirm" action: applies the user's
     * choices to merge `pendingMerge.incoming` into the architecture,
     * records it onto undo history, and logs a summary including any
     * incoming labels renamed to avoid collisions.
     * @param selectedNodeIds - incoming node ids to keep
     * @param excludedEdgeIds - incoming edge ids to drop
     * @param addedEdges - extra connections drawn in the picker
     * @param insertAtStep - trace position to insert merged nodes at
     */
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

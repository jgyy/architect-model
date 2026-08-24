"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { buildNodeIndex } from "@/lib/node-index";
import {
    mergeSelectedArchitecture,
    parseImportedArchitecture,
} from "@/lib/architecture-io";
import {
    clearPersistedState,
    interpretStorageEvent,
    loadPersistedState,
    savePersistedState,
    type LogEntry,
    type PersistedState,
} from "@/lib/persistence";
import { DEFAULT_SPEED_INDEX, clampStepIndex } from "@/lib/simulation";
import {
    EMPTY_UNDO_REDO_STATE,
    recordCommand,
    type UndoRedoState,
} from "@/lib/undo-history";
import {
    appendLogEntry,
    maxLogId,
    nextStepIndexForSameNode,
} from "@/lib/workspace-log";
import type { Architecture } from "@/types/architecture";

/**
 * A merge file that's been parsed but not yet confirmed via the picker.
 */
type PendingMerge = {
    key: number;
    fileName: string;
    incoming: Architecture;
};

/**
 * Owns everything about the workspace's persisted session: the
 * architecture, command log, simulation step/speed, undo/redo history, and
 * an in-flight merge-picker selection. Hydrates from `localStorage` on
 * mount, autosaves on change, and reacts to `storage` events from other
 * tabs so every open tab converges on the same session - including
 * cancelling a merge picker left open against an architecture another tab
 * just changed underneath it.
 * @param initialArchitecture - architecture to start from before hydration,
 * and to reset to on "clear history" or a cross-tab clear
 */
export function useWorkspaceSession(initialArchitecture: Architecture) {
    const [architecture, setArchitecture] = useState(initialArchitecture);
    const [log, setLog] = useState<LogEntry[]>([]);
    const [currentStepIndex, setCurrentStepIndex] = useState(0);
    const [speedIndex, setSpeedIndex] = useState(DEFAULT_SPEED_INDEX);
    const [hydrated, setHydrated] = useState(false);
    // Ephemeral, per-tab command history for undo/redo
    const [undoRedo, setUndoRedo] = useState<UndoRedoState>(
        EMPTY_UNDO_REDO_STATE,
    );
    const [pendingMerge, setPendingMerge] = useState<PendingMerge | null>(null);
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

    return {
        architecture,
        setArchitecture,
        log,
        currentStepIndex,
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
    };
}

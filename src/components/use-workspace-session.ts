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

/** A merge file that's been parsed but not yet confirmed via the picker. */
type PendingMerge = {
    key: number;
    fileName: string;
    incoming: Architecture;
};

/**
 * Owns the workspace's persisted session (architecture, log, step/speed,
 * undo/redo, pending merge). Hydrates from `localStorage`, autosaves, and
 * syncs across tabs via `storage` events - including cancelling a stale
 * merge picker when another tab changes the architecture underneath it.
 * @param initialArchitecture - reset target for "clear history"/cross-tab clear
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
     * Adopts `state` as the visible session (hydration or cross-tab update).
     * Undo/redo resets to empty (ephemeral, per-tab); log id counter
     * fast-forwards past `state`'s ids.
     * @param state - session snapshot to adopt
     */
    const applyPersisted = useCallback((state: PersistedState) => {
        setArchitecture(state.architecture);
        setLog(state.log);
        setCurrentStepIndex(state.stepIndex);
        setSpeedIndex(state.speedIndex);
        setUndoRedo(EMPTY_UNDO_REDO_STATE);
        nextLogIdRef.current = maxLogId(state.log) + 1;
    }, []);

    /** Resets to `initialArchitecture` with an empty log, as if nothing was persisted. */
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
     * Allocates an id, appends the outcome - log doubles as validation UI.
     * @param input - command text
     * @param ok - success flag
     * @param message - text to log
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
     * Hydrates from `localStorage` on mount (deferred to an effect since
     * it's unavailable during SSR); `hydrated` gates the autosave effect below.
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
     * Reacts to `storage` events from *other* tabs (this tab's own writes
     * don't fire it): adopts updates, resets on clear, repairs invalid writes.
     */
    useEffect(() => {
        /** Cancels an open merge picker - its selections are stale once another tab changes the architecture. */
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
         * Applies one `storage` event; an unparseable write is overwritten
         * with this tab's last known-good state so corruption doesn't spread.
         * @param event - `storage` event to react to
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
     * `currentStepIndex` clamped into bounds - it can point past the
     * trace's end after a command shrinks it (e.g. remove node).
     */
    const safeStepIndex = clampStepIndex(
        currentStepIndex,
        architecture.nodes.length,
    );

    // Whether the user has already been warned this "outage"
    const persistenceWarnedRef = useRef(false);

    /**
     * Autosaves to `localStorage` on change; skips if unchanged (avoids
     * redundant `storage` events) and logs once per failure streak.
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
     * Wipes persisted session and resets to `initialArchitecture`; logs a
     * warning only if storage removal failed (session may reappear on reload).
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
     * Sets the current step, clamped to the trace's bounds.
     * @param index - step to move to
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
     * Map/Set index over the architecture (label/id lookups, edge
     * connectivity), memoized on nodes/edges to avoid re-deriving per command.
     */
    const nodeIndex = useMemo(
        () => buildNodeIndex(architecture.nodes, architecture.edges),
        [architecture.nodes, architecture.edges],
    );

    /**
     * Imports a file as a full architecture replacement, bypassing
     * `parseCommand` but still recorded onto undo history.
     * @param file - file to import
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
     * Reads/validates a file to merge, stashing it as `pendingMerge` to
     * open the picker; the merge itself happens in `handleConfirmMerge`.
     * @param file - file to merge
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
     * Merges `pendingMerge.incoming` per the picker's choices, records
     * undo history, and logs a summary (renamed labels included).
     * @param selectedNodeIds - incoming node ids to keep
     * @param excludedEdgeIds - incoming edge ids to drop
     * @param addedEdges - extra connections drawn in picker
     * @param insertAtStep - trace position to insert at
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

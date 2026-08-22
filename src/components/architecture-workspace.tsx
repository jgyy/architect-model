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
    // Tracks the JSON we know is in localStorage
    const lastPersistedRef = useRef<string | null>(null);
    // Next id to hand out via nextLogId()
    const nextLogIdRef = useRef(1);

    const applyPersisted = useCallback((state: PersistedState) => {
        setArchitecture(state.architecture);
        setLog(state.log);
        setCurrentStepIndex(state.stepIndex);
        setSpeedIndex(state.speedIndex);
        nextLogIdRef.current = maxLogId(state.log) + 1;
    }, []);

    const resetToInitial = useCallback(() => {
        setArchitecture(initialArchitecture);
        setLog([]);
        setCurrentStepIndex(0);
        setSpeedIndex(DEFAULT_SPEED_INDEX);
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
        if (persisted) applyPersisted(persisted);
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

            if (trimmed.toLowerCase() === "help" || trimmed === "?") {
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

            const result = parseCommand(
                trimmed,
                architecture,
                options,
                nodeIndex,
            );
            if (result.ok) {
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
        [architecture, nodeIndex],
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
        (nodeId: string, newLabel: string) => {
            const command = buildRenameNodeCommand(
                nodeId,
                newLabel,
                architecture,
            );
            if (command) runCommand(command);
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

    return (
        <div className="flex h-full w-full">
            <div className="min-w-0 flex-1">
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
            <aside className="flex w-[80ch] max-w-[min(80ch,70vw)] shrink-0 flex-col border-l border-border bg-chrome font-mono text-sm">
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
                />
            </aside>
        </div>
    );
}

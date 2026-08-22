"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { ArchitectureCanvas } from "@/components/architecture-canvas";
import { ConsolePanel } from "@/components/console-panel";
import { SimulationPanel } from "@/components/simulation-panel";
import { parseCommand } from "@/lib/architecture-commands";
import { buildRemoveEdgeCommand } from "@/lib/edge-delete";
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
    resolveStepNode,
} from "@/lib/simulation";
import { SUPPORTED_COMMANDS } from "@/lib/supported-commands";
import type {
    Architecture,
    ArchitectureEdge,
    ArchitectureNode,
} from "@/types/architecture";
import type { SimulationTrace } from "@/types/simulation";

const HELP_MESSAGE = SUPPORTED_COMMANDS.join("\n");

function nextLogId(entries: LogEntry[]): number {
    return entries.length === 0 ? 1 : Math.max(...entries.map((e) => e.id)) + 1;
}

type ArchitectureWorkspaceProps = {
    initialArchitecture: Architecture;
    initialSimulationTrace?: SimulationTrace;
};

export function ArchitectureWorkspace({
    initialArchitecture,
    initialSimulationTrace = [],
}: ArchitectureWorkspaceProps) {
    const [architecture, setArchitecture] = useState(initialArchitecture);
    const [trace, setTrace] = useState(initialSimulationTrace);
    const [input, setInput] = useState("");
    const [log, setLog] = useState<LogEntry[]>([]);
    const [currentStepIndex, setCurrentStepIndex] = useState(0);
    const [speedIndex, setSpeedIndex] = useState(DEFAULT_SPEED_INDEX);
    const [hydrated, setHydrated] = useState(false);
    // Tracks the JSON we know is in localStorage
    const lastPersistedRef = useRef<string | null>(null);

    const applyPersisted = useCallback((state: PersistedState) => {
        setArchitecture(state.architecture);
        setLog(state.log);
        setTrace(state.trace);
        setCurrentStepIndex(state.stepIndex);
        setSpeedIndex(state.speedIndex);
    }, []);

    const resetToInitial = useCallback(() => {
        setArchitecture(initialArchitecture);
        setLog([]);
        setTrace(initialSimulationTrace);
        setCurrentStepIndex(0);
        setSpeedIndex(DEFAULT_SPEED_INDEX);
    }, [initialArchitecture, initialSimulationTrace]);

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

    // a remove-step command can shrink the trace out
    const safeStepIndex = clampStepIndex(currentStepIndex, trace.length);

    useEffect(() => {
        if (!hydrated) return;
        const nextState: PersistedState = {
            architecture,
            log,
            trace,
            stepIndex: safeStepIndex,
            speedIndex,
        };
        const raw = JSON.stringify(nextState);
        if (raw === lastPersistedRef.current) return;
        savePersistedState(window.localStorage, nextState);
        lastPersistedRef.current = raw;
    }, [architecture, log, trace, safeStepIndex, speedIndex, hydrated]);

    function handleClearHistory() {
        clearPersistedState(window.localStorage);
        lastPersistedRef.current = null;
        resetToInitial();
    }

    const currentStep = trace[safeStepIndex];
    const highlightedNodeId = currentStep
        ? resolveStepNode(currentStep, architecture)?.id
        : undefined;
    const traversedPath = useMemo(
        () => getTraversedPath(trace, architecture, safeStepIndex),
        [trace, architecture, safeStepIndex],
    );

    // Stable across unrelated re-renders (e.g. every command-input keystroke)
    const handleStepChange = useCallback(
        (index: number) => {
            setCurrentStepIndex(clampStepIndex(index, trace.length));
        },
        [trace.length],
    );

    // Stable across unrelated re-renders, same reason as handleStepChange
    const handleNodesChange = useCallback((nodes: ArchitectureNode[]) => {
        setArchitecture((current) => ({ ...current, nodes }));
    }, []);

    const handleEdgesChange = useCallback((edges: ArchitectureEdge[]) => {
        setArchitecture((current) => ({ ...current, edges }));
    }, []);

    // Runs a command line exactly the same way whether it was typed at the
    // prompt or synthesized by a mouse gesture (e.g. deleting an edge), so
    // both stay logged and in sync through one code path.
    const runCommand = useCallback(
        (text: string) => {
            const trimmed = text.trim();
            if (!trimmed) return;

            if (trimmed.toLowerCase() === "help" || trimmed === "?") {
                setLog((entries) => [
                    ...entries,
                    {
                        id: nextLogId(entries),
                        input: trimmed,
                        ok: true,
                        message: HELP_MESSAGE,
                    },
                ]);
                return;
            }

            const result = parseCommand(trimmed, architecture, trace);
            if (result.ok) {
                setArchitecture(result.architecture);
                setTrace(result.trace);
            }
            setLog((entries) => [
                ...entries,
                {
                    id: nextLogId(entries),
                    input: trimmed,
                    ok: result.ok,
                    message: result.message,
                },
            ]);
        },
        [architecture, trace],
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

    return (
        <div className="flex h-full w-full">
            <div className="min-w-0 flex-1">
                <ArchitectureCanvas
                    architecture={architecture}
                    highlightedNodeId={highlightedNodeId}
                    traversedNodeIds={traversedPath.nodeIds}
                    traversedEdgeIds={traversedPath.edgeIds}
                    onNodesChange={handleNodesChange}
                    onEdgesChange={handleEdgesChange}
                    onEdgeDelete={handleEdgeDelete}
                />
            </div>
            <aside className="flex w-96 flex-col border-l border-border bg-chrome">
                {trace.length > 0 && (
                    <SimulationPanel
                        trace={trace}
                        architecture={architecture}
                        currentStepIndex={safeStepIndex}
                        onStepChange={handleStepChange}
                        speedIndex={speedIndex}
                        onSpeedChange={setSpeedIndex}
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

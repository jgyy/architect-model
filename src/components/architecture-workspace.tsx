"use client";

import { CheckCircle2, Trash2, XCircle } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { ArchitectureCanvas } from "@/components/architecture-canvas";
import { CommandInput } from "@/components/command-input";
import { SimulationPanel } from "@/components/simulation-panel";
import { parseCommand } from "@/lib/architecture-commands";
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
    resolveStepNode,
} from "@/lib/simulation";
import type {
    Architecture,
    ArchitectureEdge,
    ArchitectureNode,
} from "@/types/architecture";
import type { SimulationTrace } from "@/types/simulation";

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

    function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
        event.preventDefault();
        const text = input.trim();
        if (!text) return;

        const result = parseCommand(text, architecture, trace);
        if (result.ok) {
            setArchitecture(result.architecture);
            setTrace(result.trace);
        }
        setLog((entries) => [
            ...entries,
            {
                id:
                    entries.length === 0
                        ? 1
                        : Math.max(...entries.map((e) => e.id)) + 1,
                input: text,
                ok: result.ok,
                message: result.message,
            },
        ]);
        setInput("");
    }

    return (
        <div className="flex h-full w-full">
            <div className="min-w-0 flex-1">
                <ArchitectureCanvas
                    architecture={architecture}
                    highlightedNodeId={highlightedNodeId}
                    onNodesChange={handleNodesChange}
                    onEdgesChange={handleEdgesChange}
                />
            </div>
            <aside className="flex w-96 flex-col border-l border-border bg-chrome">
                <CommandInput
                    value={input}
                    onChange={setInput}
                    onSubmit={handleSubmit}
                    architecture={architecture}
                />
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
                <div className="flex items-center justify-between border-b border-border px-3 py-2">
                    <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                        History
                    </span>
                    <button
                        type="button"
                        onClick={handleClearHistory}
                        title="Clear history"
                        className="rounded p-1 text-muted-foreground hover:bg-border hover:text-foreground"
                    >
                        <Trash2 size={14} />
                    </button>
                </div>
                <ul className="flex-1 overflow-y-auto text-sm">
                    {log.length === 0 && (
                        <li className="px-3 py-2 text-muted-foreground">
                            No commands run yet.
                        </li>
                    )}
                    {log.map((entry) => (
                        <li
                            key={entry.id}
                            className="flex items-start gap-2 px-3 py-2 hover:bg-border/40"
                        >
                            {entry.ok ? (
                                <CheckCircle2
                                    size={14}
                                    className="mt-0.5 shrink-0 text-success"
                                />
                            ) : (
                                <XCircle
                                    size={14}
                                    className="mt-0.5 shrink-0 text-danger"
                                />
                            )}
                            <div className="min-w-0">
                                <div className="truncate font-mono text-xs text-muted-foreground">
                                    {entry.input}
                                </div>
                                <div className="text-foreground">
                                    {entry.message}
                                </div>
                            </div>
                        </li>
                    ))}
                </ul>
            </aside>
        </div>
    );
}

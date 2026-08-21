"use client";

import { useCallback, useEffect, useState } from "react";

import { ArchitectureCanvas } from "@/components/architecture-canvas";
import { SimulationPanel } from "@/components/simulation-panel";
import { parseCommand } from "@/lib/architecture-commands";
import {
    clearPersistedState,
    loadPersistedState,
    savePersistedState,
    type LogEntry,
} from "@/lib/persistence";
import { clampStepIndex, resolveStepNode } from "@/lib/simulation";
import type { Architecture } from "@/types/architecture";
import type { SimulationTrace } from "@/types/simulation";

const SUPPORTED_COMMANDS = [
    'add node <label>              — e.g. "add node Cache" (aliases: create node, new node, add a node called)',
    'connect <A> to <B>            — e.g. "connect Web Server to Cache" (aliases: connect A and B, link A to B, link A and B)',
    'remove node <label>           — e.g. "remove node Cache" (alias: delete node)',
    'remove edge <A> to <B>        — e.g. "remove edge Web Server to Cache" (aliases: delete edge, disconnect A from B, disconnect A and B)',
    'add step <label>              — e.g. "add step Cache" (appends a simulation step reaching that node)',
    'set step <n> description ...  — e.g. "set step 2 description Attacker pivots to Cache"',
    'remove step <n>               — e.g. "remove step 2"',
];

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
    const [hydrated, setHydrated] = useState(false);

    // localStorage doesn't exist during SSR
    /* eslint-disable react-hooks/set-state-in-effect */
    useEffect(() => {
        const persisted = loadPersistedState(window.localStorage);
        if (persisted) {
            setArchitecture(persisted.architecture);
            setLog(persisted.log);
            setTrace(persisted.trace);
        }
        setHydrated(true);
    }, []);
    /* eslint-enable react-hooks/set-state-in-effect */

    useEffect(() => {
        if (!hydrated) return;
        savePersistedState(window.localStorage, { architecture, log, trace });
    }, [architecture, log, trace, hydrated]);

    function handleClearHistory() {
        clearPersistedState(window.localStorage);
        setArchitecture(initialArchitecture);
        setLog([]);
        setTrace(initialSimulationTrace);
        setCurrentStepIndex(0);
    }

    // a remove-step command can shrink the trace out
    const safeStepIndex = clampStepIndex(currentStepIndex, trace.length);
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
                />
            </div>
            <aside className="flex w-96 flex-col border-l border-black/[.08] dark:border-white/[.145]">
                <form
                    onSubmit={handleSubmit}
                    className="border-b border-black/[.08] p-3 dark:border-white/[.145]"
                >
                    <label
                        htmlFor="command-input"
                        className="block text-xs font-medium text-black/60 dark:text-white/60"
                    >
                        Command
                    </label>
                    <div className="mt-1 flex gap-2">
                        <input
                            id="command-input"
                            type="text"
                            value={input}
                            onChange={(event) => setInput(event.target.value)}
                            placeholder='e.g. "add node Cache"'
                            className="w-full rounded border border-black/[.15] bg-transparent px-2 py-1 text-sm outline-none focus:border-black/40 dark:border-white/[.2] dark:focus:border-white/40"
                        />
                        <button
                            type="submit"
                            className="shrink-0 rounded bg-foreground px-3 py-1 text-sm text-background"
                        >
                            Run
                        </button>
                    </div>
                    <details className="mt-2 text-xs text-black/60 dark:text-white/60">
                        <summary className="cursor-pointer">
                            Supported commands
                        </summary>
                        <ul className="mt-1 space-y-0.5 font-mono">
                            {SUPPORTED_COMMANDS.map((command) => (
                                <li key={command}>{command}</li>
                            ))}
                        </ul>
                    </details>
                </form>
                {trace.length > 0 && (
                    <SimulationPanel
                        trace={trace}
                        architecture={architecture}
                        currentStepIndex={safeStepIndex}
                        onStepChange={handleStepChange}
                    />
                )}
                <div className="flex items-center justify-between border-b border-black/[.08] px-3 py-2 dark:border-white/[.145]">
                    <span className="text-xs font-medium text-black/60 dark:text-white/60">
                        History
                    </span>
                    <button
                        type="button"
                        onClick={handleClearHistory}
                        className="text-xs text-black/60 underline hover:text-black dark:text-white/60 dark:hover:text-white"
                    >
                        Clear history
                    </button>
                </div>
                <ul className="flex-1 space-y-2 overflow-y-auto p-3 text-sm">
                    {log.length === 0 && (
                        <li className="text-black/40 dark:text-white/40">
                            No commands run yet.
                        </li>
                    )}
                    {log.map((entry) => (
                        <li key={entry.id}>
                            <div className="font-mono text-xs text-black/60 dark:text-white/60">
                                {entry.input}
                            </div>
                            <div
                                className={
                                    entry.ok
                                        ? "text-green-600 dark:text-green-400"
                                        : "text-red-600 dark:text-red-400"
                                }
                            >
                                {entry.message}
                            </div>
                        </li>
                    ))}
                </ul>
            </aside>
        </div>
    );
}

"use client";

import { useRef, useState } from "react";

import { ArchitectureCanvas } from "@/components/architecture-canvas";
import { SimulationPanel } from "@/components/simulation-panel";
import { parseCommand } from "@/lib/architecture-commands";
import { clampStepIndex, resolveStepNode } from "@/lib/simulation";
import type { Architecture } from "@/types/architecture";
import type { SimulationTrace } from "@/types/simulation";

type LogEntry = {
  id: number;
  input: string;
  ok: boolean;
  message: string;
};

const SUPPORTED_COMMANDS = [
  'add node <label>              — e.g. "add node Cache"',
  'connect <A> to <B>            — e.g. "connect Web Server to Cache"',
  'remove node <label>           — e.g. "remove node Cache"',
  'remove edge <A> to <B>        — e.g. "remove edge Web Server to Cache"',
];

type ArchitectureWorkspaceProps = {
  initialArchitecture: Architecture;
  simulationTrace?: SimulationTrace;
};

export function ArchitectureWorkspace({
  initialArchitecture,
  simulationTrace = [],
}: ArchitectureWorkspaceProps) {
  const [architecture, setArchitecture] = useState(initialArchitecture);
  const [input, setInput] = useState("");
  const [log, setLog] = useState<LogEntry[]>([]);
  const nextLogId = useRef(1);
  const [currentStepIndex, setCurrentStepIndex] = useState(0);

  const currentStep = simulationTrace[currentStepIndex];
  const highlightedNodeId = currentStep
    ? resolveStepNode(currentStep, architecture)?.id
    : undefined;

  function handleStepChange(index: number) {
    setCurrentStepIndex(clampStepIndex(index, simulationTrace.length));
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const text = input.trim();
    if (!text) return;

    const result = parseCommand(text, architecture);
    if (result.ok) {
      setArchitecture(result.architecture);
    }
    setLog((entries) => [
      ...entries,
      { id: nextLogId.current++, input: text, ok: result.ok, message: result.message },
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
        <form onSubmit={handleSubmit} className="border-b border-black/[.08] p-3 dark:border-white/[.145]">
          <label htmlFor="command-input" className="block text-xs font-medium text-black/60 dark:text-white/60">
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
            <summary className="cursor-pointer">Supported commands</summary>
            <ul className="mt-1 space-y-0.5 font-mono">
              {SUPPORTED_COMMANDS.map((command) => (
                <li key={command}>{command}</li>
              ))}
            </ul>
          </details>
        </form>
        {simulationTrace.length > 0 && (
          <SimulationPanel
            trace={simulationTrace}
            architecture={architecture}
            currentStepIndex={currentStepIndex}
            onStepChange={handleStepChange}
          />
        )}
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
              <div className={entry.ok ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"}>
                {entry.message}
              </div>
            </li>
          ))}
        </ul>
      </aside>
    </div>
  );
}

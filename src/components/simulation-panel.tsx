"use client";

import { resolveStepNode } from "@/lib/simulation";
import type { Architecture } from "@/types/architecture";
import type { SimulationTrace } from "@/types/simulation";

type SimulationPanelProps = {
  trace: SimulationTrace;
  architecture: Architecture;
  currentStepIndex: number;
  onStepChange: (index: number) => void;
};

export function SimulationPanel({
  trace,
  architecture,
  currentStepIndex,
  onStepChange,
}: SimulationPanelProps) {
  if (trace.length === 0) return null;

  const step = trace[currentStepIndex];
  const node = resolveStepNode(step, architecture);

  return (
    <div className="border-b border-black/[.08] p-3 dark:border-white/[.145]">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-black/60 dark:text-white/60">
          Simulation
        </span>
        <span className="text-xs text-black/60 dark:text-white/60">
          Step {currentStepIndex + 1} / {trace.length}
        </span>
      </div>
      <p className="mt-1 text-sm">{step.description}</p>
      {!node && (
        <p className="mt-1 text-xs text-red-600 dark:text-red-400">
          (node no longer in architecture)
        </p>
      )}
      <div className="mt-2 flex gap-2">
        <button
          type="button"
          onClick={() => onStepChange(currentStepIndex - 1)}
          disabled={currentStepIndex === 0}
          className="rounded border border-black/[.15] px-3 py-1 text-sm disabled:opacity-40 dark:border-white/[.2]"
        >
          Prev
        </button>
        <button
          type="button"
          onClick={() => onStepChange(currentStepIndex + 1)}
          disabled={currentStepIndex === trace.length - 1}
          className="rounded border border-black/[.15] px-3 py-1 text-sm disabled:opacity-40 dark:border-white/[.2]"
        >
          Next
        </button>
      </div>
    </div>
  );
}

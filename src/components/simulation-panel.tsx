"use client";

import { useEffect, useState } from "react";

import { getNextPlayIndex, resolveStepNode } from "@/lib/simulation";
import type { Architecture } from "@/types/architecture";
import type { SimulationTrace } from "@/types/simulation";

const PLAY_SPEEDS = [
    { label: "0.5x", intervalMs: 3000 },
    { label: "1x", intervalMs: 1500 },
    { label: "2x", intervalMs: 750 },
    { label: "4x", intervalMs: 375 },
];
const DEFAULT_SPEED_INDEX = 1;

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
    const [isPlaying, setIsPlaying] = useState(false);
    const [speedIndex, setSpeedIndex] = useState(DEFAULT_SPEED_INDEX);

    // Recursive setTimeout, not setInterval
    useEffect(() => {
        if (!isPlaying) return;

        const next = getNextPlayIndex(currentStepIndex, trace.length);
        const timer = setTimeout(
            () => (next === null ? setIsPlaying(false) : onStepChange(next)),
            next === null ? 0 : PLAY_SPEEDS[speedIndex].intervalMs,
        );
        return () => clearTimeout(timer);
    }, [isPlaying, currentStepIndex, trace.length, onStepChange, speedIndex]);

    if (trace.length === 0) return null;

    const step = trace[currentStepIndex];
    const node = resolveStepNode(step, architecture);
    const atLastStep = currentStepIndex === trace.length - 1;

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
                    onClick={() => setIsPlaying((playing) => !playing)}
                    disabled={trace.length <= 1 || (!isPlaying && atLastStep)}
                    className="rounded border border-black/[.15] px-3 py-1 text-sm disabled:opacity-40 dark:border-white/[.2]"
                >
                    {isPlaying ? "⏸ Pause" : "▶ Play"}
                </button>
                <button
                    type="button"
                    onClick={() => onStepChange(currentStepIndex + 1)}
                    disabled={atLastStep}
                    className="rounded border border-black/[.15] px-3 py-1 text-sm disabled:opacity-40 dark:border-white/[.2]"
                >
                    Next
                </button>
                <select
                    aria-label="Playback speed"
                    value={speedIndex}
                    onChange={(event) =>
                        setSpeedIndex(Number(event.target.value))
                    }
                    className="rounded border border-black/[.15] px-2 py-1 text-sm dark:border-white/[.2] dark:bg-transparent"
                >
                    {PLAY_SPEEDS.map((speed, index) => (
                        <option key={speed.label} value={index}>
                            {speed.label}
                        </option>
                    ))}
                </select>
            </div>
        </div>
    );
}

"use client";

import { Pause, Play, SkipBack, SkipForward } from "lucide-react";
import { useEffect, useState } from "react";

import { SimulationTimeline } from "@/components/simulation-timeline";
import {
    PLAY_SPEEDS,
    getNextPlayIndex,
    resolveStepNode,
} from "@/lib/simulation";
import type { Architecture } from "@/types/architecture";
import type { SimulationTrace } from "@/types/simulation";

type SimulationPanelProps = {
    trace: SimulationTrace;
    architecture: Architecture;
    currentStepIndex: number;
    onStepChange: (index: number) => void;
    speedIndex: number;
    onSpeedChange: (index: number) => void;
};

export function SimulationPanel({
    trace,
    architecture,
    currentStepIndex,
    onStepChange,
    speedIndex,
    onSpeedChange,
}: SimulationPanelProps) {
    const [isPlaying, setIsPlaying] = useState(false);

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
        <div className="border-b border-border p-3">
            <div className="flex items-center justify-between">
                <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                    Simulation
                </span>
                <span className="font-mono text-xs text-muted-foreground">
                    Step {currentStepIndex + 1} / {trace.length}
                </span>
            </div>
            <p className="mt-1 text-sm text-foreground">{step.description}</p>
            {!node && (
                <p className="mt-1 text-xs text-danger">
                    (node no longer in architecture)
                </p>
            )}
            <div className="mt-2 flex items-center gap-1.5">
                <button
                    type="button"
                    onClick={() => onStepChange(currentStepIndex - 1)}
                    disabled={currentStepIndex === 0}
                    title="Previous step"
                    className="flex h-9 w-9 items-center justify-center rounded-md border border-border text-foreground hover:bg-border/40 disabled:opacity-40"
                >
                    <SkipBack size={16} />
                </button>
                <button
                    type="button"
                    onClick={() => setIsPlaying((playing) => !playing)}
                    disabled={trace.length <= 1 || (!isPlaying && atLastStep)}
                    title={isPlaying ? "Pause" : "Play"}
                    className="flex h-9 w-9 items-center justify-center rounded-md border border-border text-foreground hover:bg-border/40 disabled:opacity-40"
                >
                    {isPlaying ? (
                        <Pause size={16} />
                    ) : (
                        <Play size={16} className="ml-0.5" />
                    )}
                </button>
                <button
                    type="button"
                    onClick={() => onStepChange(currentStepIndex + 1)}
                    disabled={atLastStep}
                    title="Next step"
                    className="flex h-9 w-9 items-center justify-center rounded-md border border-border text-foreground hover:bg-border/40 disabled:opacity-40"
                >
                    <SkipForward size={16} />
                </button>
                <select
                    aria-label="Playback speed"
                    value={speedIndex}
                    onChange={(event) =>
                        onSpeedChange(Number(event.target.value))
                    }
                    className="h-9 rounded-md border border-border bg-background px-2 text-sm text-foreground"
                >
                    {PLAY_SPEEDS.map((speed, index) => (
                        <option key={speed.label} value={index}>
                            {speed.label}
                        </option>
                    ))}
                </select>
            </div>
            <div className="mt-2 flex items-center gap-3 text-xs text-muted-foreground">
                <span className="flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full bg-accent" />
                    current
                </span>
                <span className="flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full bg-danger" />
                    traversed
                </span>
            </div>
            <SimulationTimeline
                trace={trace}
                architecture={architecture}
                currentStepIndex={currentStepIndex}
                onStepChange={onStepChange}
            />
        </div>
    );
}

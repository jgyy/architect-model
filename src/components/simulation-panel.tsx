"use client";

import { Pause, Play, SkipBack, SkipForward } from "lucide-react";
import { useEffect, useState } from "react";

import { SimulationTimeline } from "@/components/simulation-timeline";
import {
    PLAY_SPEEDS,
    getNextPlayIndex,
    stepDescription,
} from "@/lib/simulation";
import type { Architecture } from "@/types/architecture";

/** Props for {@link SimulationPanel}: controlled component - state lives in the parent. */
type SimulationPanelProps = {
    /** Trace is this array's node order (see {@link stepDescription}). */
    architecture: Architecture;
    /** Index into `architecture.nodes`. */
    currentStepIndex: number;
    /** Requests a step change. */
    onStepChange: (index: number) => void;
    /** Index into {@link PLAY_SPEEDS}. */
    speedIndex: number;
    /** Requests a {@link PLAY_SPEEDS} change. */
    onSpeedChange: (index: number) => void;
    /** Requests moving `nodeId` to `toIndex`. */
    onReorder: (nodeId: string, toIndex: number) => void;
};

/**
 * Playback control for the trace: step/play/pause/speed, plus (via {@link SimulationTimeline})
 * jump/reorder. Renders nothing with no nodes.
 */
export function SimulationPanel({
    architecture,
    currentStepIndex,
    onStepChange,
    speedIndex,
    onSpeedChange,
    onReorder,
}: SimulationPanelProps) {
    const [isPlaying, setIsPlaying] = useState(false);
    const stepCount = architecture.nodes.length;

    useEffect(() => {
        if (!isPlaying) return;

        const next = getNextPlayIndex(currentStepIndex, stepCount);
        const timer = setTimeout(
            () => (next === null ? setIsPlaying(false) : onStepChange(next)),
            next === null ? 0 : PLAY_SPEEDS[speedIndex].intervalMs,
        );
        return () => clearTimeout(timer);
    }, [isPlaying, currentStepIndex, stepCount, onStepChange, speedIndex]);

    if (stepCount === 0) return null;

    const node = architecture.nodes[currentStepIndex];
    const atLastStep = currentStepIndex === stepCount - 1;

    return (
        <div className="border-b border-border p-3 font-sans">
            <div className="flex items-center justify-between">
                <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                    3 · Simulate
                </span>
                <span className="font-mono text-xs text-muted-foreground">
                    Step {currentStepIndex + 1} / {stepCount}
                </span>
            </div>
            <p className="mt-1 text-sm text-foreground">
                {stepDescription(node)}
            </p>
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
                    disabled={stepCount <= 1 || (!isPlaying && atLastStep)}
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
                    <span className="h-2 w-2 rounded-full bg-current-step" />
                    current
                </span>
                <span className="flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full bg-danger" />
                    traversed
                </span>
            </div>
            <SimulationTimeline
                architecture={architecture}
                currentStepIndex={currentStepIndex}
                onStepChange={onStepChange}
                onReorder={onReorder}
            />
        </div>
    );
}

"use client";

import { CheckCircle2, Redo2, Trash2, Undo2, XCircle } from "lucide-react";
import { useEffect, useRef } from "react";

import { CommandInput } from "@/components/command-input";
import type { LogEntry } from "@/lib/persistence";
import type { Architecture } from "@/types/architecture";

type ConsolePanelProps = {
    log: LogEntry[];
    onClear: () => void;
    input: string;
    onInputChange: (value: string) => void;
    onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
    architecture: Architecture;
    canUndo: boolean;
    canRedo: boolean;
    onUndo: () => void;
    onRedo: () => void;
};

// A REPL-style console: scrolling command/output history with a live prompt
export function ConsolePanel({
    log,
    onClear,
    input,
    onInputChange,
    onSubmit,
    architecture,
    canUndo,
    canRedo,
    onUndo,
    onRedo,
}: ConsolePanelProps) {
    const scrollRef = useRef<HTMLDivElement>(null);
    // Whether the user was already at (or near) the bottom before this log
    // change, kept up to date by handleScroll independently of the log
    // itself settling this only once per user scroll, not once per log
    // change (which would always see the already-updated, grown scrollHeight)
    const stickToBottomRef = useRef(true);

    useEffect(() => {
        // scrollIntoView on a sentinel forces a full geometry computation
        const container = scrollRef.current;
        if (container && stickToBottomRef.current) {
            container.scrollTop = container.scrollHeight;
        }
    }, [log.length]);

    const NEAR_BOTTOM_THRESHOLD_PX = 32;

    function handleScroll(event: React.UIEvent<HTMLDivElement>) {
        const el = event.currentTarget;
        const distanceFromBottom =
            el.scrollHeight - el.scrollTop - el.clientHeight;
        stickToBottomRef.current =
            distanceFromBottom <= NEAR_BOTTOM_THRESHOLD_PX;
    }

    return (
        <div className="flex min-h-0 flex-1 flex-col font-mono text-sm">
            <div className="flex w-full items-center justify-between gap-6 border-b border-border px-3 py-2">
                <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                    Console
                </span>
                <div className="flex items-center gap-1">
                    <button
                        type="button"
                        onClick={onUndo}
                        disabled={!canUndo}
                        title="Undo"
                        className="rounded p-1 text-muted-foreground hover:bg-border hover:text-foreground disabled:pointer-events-none disabled:opacity-40"
                    >
                        <Undo2 size={14} />
                    </button>
                    <button
                        type="button"
                        onClick={onRedo}
                        disabled={!canRedo}
                        title="Redo"
                        className="rounded p-1 text-muted-foreground hover:bg-border hover:text-foreground disabled:pointer-events-none disabled:opacity-40"
                    >
                        <Redo2 size={14} />
                    </button>
                    <button
                        type="button"
                        onClick={onClear}
                        title="Clear console"
                        className="rounded p-1 text-muted-foreground hover:bg-border hover:text-foreground"
                    >
                        <Trash2 size={14} />
                    </button>
                </div>
            </div>
            <div
                ref={scrollRef}
                onScroll={handleScroll}
                className="min-h-0 flex-1 overflow-y-auto"
            >
                {log.length === 0 ? (
                    <p className="max-w-[80ch] break-words px-3 py-2 text-muted-foreground">
                        Blast Radius console - type{" "}
                        <span className="text-foreground">help</span> for a list
                        of commands.
                    </p>
                ) : (
                    log.map((entry) => (
                        <div
                            key={entry.id}
                            className="flex w-full items-start gap-2 px-3 py-1.5 hover:bg-border/40"
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
                            <div className="min-w-0 max-w-[80ch] flex-1 break-words">
                                <div className="text-accent">
                                    <span className="text-muted-foreground">
                                        &gt;
                                    </span>{" "}
                                    {entry.input}
                                </div>
                                <div className="whitespace-pre-wrap text-foreground">
                                    {entry.message}
                                </div>
                            </div>
                        </div>
                    ))
                )}
            </div>
            <CommandInput
                value={input}
                onChange={onInputChange}
                onSubmit={onSubmit}
                architecture={architecture}
                commands={log.map((entry) => entry.input)}
            />
        </div>
    );
}

"use client";

import { CheckCircle2, Trash2, XCircle } from "lucide-react";
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
};

// A REPL-style console: scrolling command/output history with a live prompt
// pinned at the bottom, replacing the old split input-box + history-list
export function ConsolePanel({
    log,
    onClear,
    input,
    onInputChange,
    onSubmit,
    architecture,
}: ConsolePanelProps) {
    const bottomRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        bottomRef.current?.scrollIntoView({ block: "nearest" });
    }, [log.length]);

    return (
        <div className="flex min-h-0 flex-1 flex-col">
            <div className="flex items-center justify-between border-b border-border px-3 py-2">
                <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                    Console
                </span>
                <button
                    type="button"
                    onClick={onClear}
                    title="Clear console"
                    className="rounded p-1 text-muted-foreground hover:bg-border hover:text-foreground"
                >
                    <Trash2 size={14} />
                </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto font-mono text-xs">
                {log.length === 0 ? (
                    <p className="px-3 py-2 text-muted-foreground">
                        Architecture Model console — type{" "}
                        <span className="text-foreground">help</span> for a list
                        of commands.
                    </p>
                ) : (
                    log.map((entry) => (
                        <div
                            key={entry.id}
                            className="flex items-start gap-2 px-3 py-1.5 hover:bg-border/40"
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
                            <div className="min-w-0 flex-1">
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
                <div ref={bottomRef} />
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

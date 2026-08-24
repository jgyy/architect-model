"use client";

import {
    CheckCircle2,
    Download,
    Merge,
    Redo2,
    Trash2,
    Undo2,
    Upload,
    XCircle,
} from "lucide-react";
import { useEffect, useRef } from "react";

import { CommandInput } from "@/components/command-input";
import type { NodeIndex } from "@/lib/architecture-commands";
import type { LogEntry } from "@/lib/persistence";
import type { Architecture } from "@/types/architecture";

/**
 * Clickable example commands shown in the empty-log state so a first-time
 * user has something to try instead of guessing the syntax.
 */
const EXAMPLE_COMMANDS = [
    "add node Cache",
    "connect Web Server to Cache",
    "help",
];

/**
 * Props for {@link ConsolePanel}: log/input state plus callbacks for the
 * toolbar actions (undo/redo, export/import/merge, clear).
 */
type ConsolePanelProps = {
    /** Commands and outcomes, rendered as the scrolling log. */
    log: LogEntry[];
    onClear: () => void;
    /** Controlled input's current text. */
    input: string;
    onInputChange: (value: string) => void;
    /** Submits the typed command upstream for parsing. */
    onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
    /** Graph passed to {@link CommandInput} for suggestions. */
    architecture: Architecture;
    /**
     * Precomputed lookup index over the architecture (Maps/a Set by label,
     * id, edge endpoints), built once per command. Used by
     * {@link CommandInput} for node-name autocomplete.
     */
    nodeIndex?: NodeIndex;
    /** Whether undo has an entry. */
    canUndo: boolean;
    /** Whether redo has an entry. */
    canRedo: boolean;
    onUndo: () => void;
    onRedo: () => void;
    /** Downloads the current architecture. */
    onExport: () => void;
    /** Replaces the architecture with the picked file. */
    onImport: (file: File) => void;
    /** Merges the picked file into the architecture. */
    onMerge: (file: File) => void;
};

/**
 * The command console: a REPL-style panel logging every submitted command
 * with its success/failure outcome, doubling as the app's validation UI.
 * Also hosts the undo/redo and export/import/merge toolbar, and renders
 * the live command input.
 */
export function ConsolePanel({
    log,
    onClear,
    input,
    onInputChange,
    onSubmit,
    architecture,
    nodeIndex,
    canUndo,
    canRedo,
    onUndo,
    onRedo,
    onExport,
    onImport,
    onMerge,
}: ConsolePanelProps) {
    const scrollRef = useRef<HTMLDivElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const mergeInputRef = useRef<HTMLInputElement>(null);
    // Whether the user was at (or near) the bottom of the log the last time
    // they scrolled. Updated only by handleScroll below, not by the
    // auto-scroll effect that follows - if it were updated on every log
    // change instead, it would always see the already-grown scrollHeight
    // and report "at the bottom" even when the user had scrolled up to
    // read older entries.
    const stickToBottomRef = useRef(true);

    useEffect(() => {
        // Snap to the bottom when a new entry is appended, but only if the
        // user was already stuck there - otherwise leave their scroll
        // position alone so they can keep reading older entries.
        const container = scrollRef.current;
        if (container && stickToBottomRef.current) {
            container.scrollTop = container.scrollHeight;
        }
    }, [log.length]);

    const NEAR_BOTTOM_THRESHOLD_PX = 32;

    /**
     * Updates {@link stickToBottomRef} from the current scroll position, so
     * the auto-scroll effect knows whether to keep pinning to the bottom or
     * leave the user's scroll-up alone.
     * @param event - the log container's scroll event
     */
    function handleScroll(event: React.UIEvent<HTMLDivElement>) {
        const el = event.currentTarget;
        const distanceFromBottom =
            el.scrollHeight - el.scrollTop - el.clientHeight;
        stickToBottomRef.current =
            distanceFromBottom <= NEAR_BOTTOM_THRESHOLD_PX;
    }

    /**
     * Reads the picked file from the hidden import/merge input and forwards
     * it to the wired callback.
     * @param event - change event
     * @param onPicked - callback for the file (import or merge)
     */
    function handleFilePicked(
        event: React.ChangeEvent<HTMLInputElement>,
        onPicked: (file: File) => void,
    ) {
        const file = event.target.files?.[0];
        // reset so choosing the same file again still fires this handler
        event.target.value = "";
        if (file) onPicked(file);
    }

    return (
        <div className="flex min-h-0 flex-1 flex-col font-mono text-sm">
            <div className="flex w-full items-center justify-between gap-6 border-b border-border px-3 py-2">
                <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                    1 · Describe
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
                        onClick={onExport}
                        title="Export architecture"
                        className="rounded p-1 text-muted-foreground hover:bg-border hover:text-foreground"
                    >
                        <Download size={14} />
                    </button>
                    <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        title="Import architecture"
                        className="rounded p-1 text-muted-foreground hover:bg-border hover:text-foreground"
                    >
                        <Upload size={14} />
                    </button>
                    <input
                        ref={fileInputRef}
                        type="file"
                        accept="application/json,.json"
                        onChange={(event) => handleFilePicked(event, onImport)}
                        aria-label="Import architecture file"
                        className="hidden"
                    />
                    <button
                        type="button"
                        onClick={() => mergeInputRef.current?.click()}
                        title="Merge architecture"
                        className="rounded p-1 text-muted-foreground hover:bg-border hover:text-foreground"
                    >
                        <Merge size={14} />
                    </button>
                    <input
                        ref={mergeInputRef}
                        type="file"
                        accept="application/json,.json"
                        onChange={(event) => handleFilePicked(event, onMerge)}
                        aria-label="Merge architecture file"
                        className="hidden"
                    />
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
                    <div className="px-3 py-2">
                        <p className="max-w-[80ch] break-words text-muted-foreground">
                            Blast Radius console - type{" "}
                            <span className="text-foreground">help</span> for a
                            list of commands.
                        </p>
                        <div className="mt-2 flex flex-wrap gap-1.5">
                            {EXAMPLE_COMMANDS.map((command) => (
                                <button
                                    key={command}
                                    type="button"
                                    onClick={() => {
                                        onInputChange(command);
                                        document
                                            .getElementById("command-input")
                                            ?.focus();
                                    }}
                                    className="rounded-full border border-border px-2.5 py-1 font-mono text-xs text-muted-foreground hover:border-accent/60 hover:text-accent"
                                >
                                    {command}
                                </button>
                            ))}
                        </div>
                    </div>
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
                nodeIndex={nodeIndex}
                commands={log.map((entry) => entry.input)}
            />
        </div>
    );
}

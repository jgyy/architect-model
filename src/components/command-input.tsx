"use client";

import { useEffect, useRef, useState } from "react";

import {
    applyNodeSuggestion,
    suggestNodeReference,
} from "@/lib/node-suggestions";
import type { Architecture, ArchitectureNode } from "@/types/architecture";

const SUPPORTED_COMMANDS = [
    'add node <label>              — e.g. "add node Cache" (aliases: create node, new node, add a node called)',
    'connect <A> to <B>            — e.g. "connect Web Server to Cache" (aliases: connect A and B, link A to B, link A and B)',
    'remove node <label>           — e.g. "remove node Cache" (alias: delete node)',
    'remove edge <A> to <B>        — e.g. "remove edge Web Server to Cache" (aliases: delete edge, disconnect A from B, disconnect A and B)',
    'add step <label>              — e.g. "add step Cache" (appends a simulation step reaching that node)',
    'set step <n> description ...  — e.g. "set step 2 description Attacker pivots to Cache"',
    'remove step <n>               — e.g. "remove step 2"',
];

type CommandInputProps = {
    value: string;
    onChange: (value: string) => void;
    onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
    architecture: Architecture;
};

// Free-text command box with an inline node-reference autocomplete
export function CommandInput({
    value,
    onChange,
    onSubmit,
    architecture,
}: CommandInputProps) {
    const inputRef = useRef<HTMLInputElement>(null);
    const [activeIndex, setActiveIndex] = useState(0);
    // suppressed right after a pick, until the user types again
    const [dismissed, setDismissed] = useState(false);
    // which argument ("connect A|to B" vs "connect A to B|") suggestions target
    const [cursorPosition, setCursorPosition] = useState(value.length);
    // resets activeIndex during render when the suggestion list changes
    const [lastValue, setLastValue] = useState(value);
    if (value !== lastValue) {
        setLastValue(value);
        setActiveIndex(0);
    }

    // selectSuggestion queues a target here; applied once `value`'s DOM
    // update has committed, since setSelectionRange needs the new text first
    const pendingCursorRef = useRef<number | null>(null);
    useEffect(() => {
        const pending = pendingCursorRef.current;
        if (pending === null) return;
        pendingCursorRef.current = null;
        inputRef.current?.setSelectionRange(pending, pending);
        setCursorPosition(pending);
    }, [value]);

    const suggestion = suggestNodeReference(
        value,
        architecture,
        Math.min(cursorPosition, value.length),
    );
    const options = dismissed ? [] : (suggestion?.matches ?? []);

    function trackCursor(target: HTMLInputElement) {
        setCursorPosition(target.selectionStart ?? target.value.length);
    }

    function selectSuggestion(node: ArchitectureNode) {
        if (!suggestion) return;
        const applied = applyNodeSuggestion(value, suggestion, node);
        onChange(applied.value);
        pendingCursorRef.current = applied.cursor;
        setDismissed(true);
        inputRef.current?.focus();
    }

    function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
        if (options.length === 0) return;
        switch (event.key) {
            case "ArrowDown":
                event.preventDefault();
                setActiveIndex((i) => (i + 1) % options.length);
                break;
            case "ArrowUp":
                event.preventDefault();
                setActiveIndex((i) => (i - 1 + options.length) % options.length);
                break;
            case "Enter":
                event.preventDefault();
                selectSuggestion(options[activeIndex]);
                break;
            case "Escape":
                setDismissed(true);
                break;
        }
    }

    return (
        <form
            onSubmit={onSubmit}
            className="border-b border-black/[.08] p-3 dark:border-white/[.145]"
        >
            <label
                htmlFor="command-input"
                className="block text-xs font-medium text-black/60 dark:text-white/60"
            >
                Command
            </label>
            <div className="mt-1 flex gap-2">
                <div className="relative flex-1">
                    <input
                        id="command-input"
                        ref={inputRef}
                        type="text"
                        value={value}
                        onChange={(event) => {
                            onChange(event.target.value);
                            setDismissed(false);
                            trackCursor(event.target);
                        }}
                        onKeyDown={handleKeyDown}
                        onKeyUp={(event) => trackCursor(event.currentTarget)}
                        onClick={(event) => trackCursor(event.currentTarget)}
                        onSelect={(event) => trackCursor(event.currentTarget)}
                        placeholder='e.g. "add node Cache"'
                        autoComplete="off"
                        role="combobox"
                        aria-expanded={options.length > 0}
                        aria-controls="command-suggestions"
                        className="w-full rounded border border-black/[.15] bg-transparent px-2 py-1 text-sm outline-none focus:border-black/40 dark:border-white/[.2] dark:focus:border-white/40"
                    />
                    {options.length > 0 && (
                        <ul
                            id="command-suggestions"
                            role="listbox"
                            className="absolute top-full left-0 z-10 mt-1 max-h-40 w-full overflow-y-auto rounded border border-black/[.15] bg-background shadow-md dark:border-white/[.2]"
                        >
                            {options.map((node, index) => (
                                <li key={node.id} role="option" aria-selected={index === activeIndex}>
                                    <button
                                        type="button"
                                        onMouseDown={(event) => event.preventDefault()}
                                        onClick={() => selectSuggestion(node)}
                                        className={`block w-full px-2 py-1 text-left text-sm ${index === activeIndex
                                            ? "bg-black/[.06] dark:bg-white/[.1]"
                                            : ""
                                            }`}
                                    >
                                        {node.data.label}
                                    </button>
                                </li>
                            ))}
                        </ul>
                    )}
                </div>
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
    );
}

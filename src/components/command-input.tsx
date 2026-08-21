"use client";

import { useEffect, useRef, useState } from "react";

import {
    applyNodeSuggestion,
    suggestNodeReference,
    suggestionIsCompleteMatch,
} from "@/lib/node-suggestions";
import type { Architecture, ArchitectureNode } from "@/types/architecture";

const SUPPORTED_COMMANDS = [
    'add node <label>              — e.g. "add node Cache" (aliases: create node, new node, add a node called)',
    'connect <A> to <B>            — e.g. "connect Web Server to Cache" (aliases: connect A and B, link A to B, link A and B)',
    'remove node <label>           — e.g. "remove node Cache" (alias: delete node)',
    'remove edge <A> to <B>        — e.g. "remove edge Web Server to Cache" (aliases: delete edge, disconnect A from B, disconnect A and B)',
    'add step <label>              — e.g. "add step Cache" (appends a simulation step reaching that node)',
    'insert step <n> <label>       — e.g. "insert step 2 Cache" (inserts a step at that position, shifting later ones down)',
    'set step <n> description ...  — e.g. "set step 2 description Attacker pivots to Cache"',
    'remove step <n>               — e.g. "remove step 2"',
    'move step <a> to <b>          — e.g. "move step 3 to 1" (relocates a step, renumbering the rest)',
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

    // selectSuggestion queues a target here; applied once `value`'s DOM
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

    // Resets activeIndex during render whenever the suggested argument slot
    // changes — not just when the text changes, since moving the cursor to a
    // different argument (with no typing) changes which slot is suggested
    // without changing `value`, and a stale index could point past the end
    // of a now-shorter options array.
    const suggestionSignature = suggestion
        ? JSON.stringify([value, suggestion.replaceFrom, suggestion.replaceTo])
        : value;
    const [lastSuggestionSignature, setLastSuggestionSignature] =
        useState(suggestionSignature);
    if (suggestionSignature !== lastSuggestionSignature) {
        setLastSuggestionSignature(suggestionSignature);
        setActiveIndex(0);
    }
    const activeOptionIndex =
        options.length === 0 ? 0 : Math.min(activeIndex, options.length - 1);

    function trackCursor(target: HTMLInputElement) {
        setCursorPosition(target.selectionStart ?? target.value.length);
    }

    function selectSuggestion(node: ArchitectureNode | undefined) {
        if (!suggestion || !node) return;
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
                setActiveIndex(
                    (i) => (i - 1 + options.length) % options.length,
                );
                break;
            case "Enter":
                // an already-complete, unambiguous reference should submit
                // the command, not be swallowed by the autocomplete
                if (
                    suggestion &&
                    suggestionIsCompleteMatch(value, suggestion)
                ) {
                    break;
                }
                event.preventDefault();
                selectSuggestion(options[activeOptionIndex]);
                break;
            case "Escape":
                setDismissed(true);
                break;
        }
    }

    return (
        <form onSubmit={onSubmit} className="border-b border-border p-3">
            <label
                htmlFor="command-input"
                className="block text-xs font-medium tracking-wide text-muted-foreground uppercase"
            >
                Command
            </label>
            <div className="mt-1.5 flex gap-2">
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
                        className="w-full rounded-md border border-border bg-background px-2.5 py-1.5 font-mono text-sm text-foreground outline-none focus:border-accent"
                    />
                    {options.length > 0 && (
                        <ul
                            id="command-suggestions"
                            role="listbox"
                            className="absolute top-full left-0 z-10 mt-1 max-h-40 w-full overflow-y-auto rounded-md border border-border bg-background shadow-md"
                        >
                            {options.map((node, index) => (
                                <li
                                    key={node.id}
                                    role="option"
                                    aria-selected={index === activeOptionIndex}
                                >
                                    <button
                                        type="button"
                                        onMouseDown={(event) =>
                                            event.preventDefault()
                                        }
                                        onClick={() => selectSuggestion(node)}
                                        className={`block w-full px-2.5 py-1.5 text-left text-sm ${
                                            index === activeOptionIndex
                                                ? "bg-accent/10 text-accent"
                                                : "text-foreground"
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
                    className="shrink-0 rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-accent-foreground hover:opacity-90"
                >
                    Run
                </button>
            </div>
            <details className="mt-2 text-xs text-muted-foreground">
                <summary className="cursor-pointer select-none hover:text-foreground">
                    Supported commands
                </summary>
                <ul className="mt-1.5 space-y-0.5 font-mono">
                    {SUPPORTED_COMMANDS.map((command) => (
                        <li key={command}>{command}</li>
                    ))}
                </ul>
            </details>
        </form>
    );
}

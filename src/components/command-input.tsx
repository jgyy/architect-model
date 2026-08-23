"use client";

import { useEffect, useRef, useState } from "react";

import type { NodeIndex } from "@/lib/architecture-commands";
import {
    recallNewerCommand,
    recallOlderCommand,
    type CommandHistoryState,
} from "@/lib/command-history";
import {
    applyNodeSuggestion,
    suggestNodeReference,
    suggestionIsCompleteMatch,
} from "@/lib/node-suggestions";
import type { Architecture, ArchitectureNode } from "@/types/architecture";

const IDLE_HISTORY: CommandHistoryState = { index: null, draft: "" };

type CommandInputProps = {
    value: string;
    onChange: (value: string) => void;
    onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
    architecture: Architecture;
    // caller's memoized index, so a keystroke never rebuilds the trie
    nodeIndex?: NodeIndex;
    // previously submitted command text, oldest first, recalled with Up/Down
    commands: string[];
};

// Terminal-style prompt line with inline node-reference autocomplete
export function CommandInput({
    value,
    onChange,
    onSubmit,
    architecture,
    nodeIndex,
    commands,
}: CommandInputProps) {
    const inputRef = useRef<HTMLInputElement>(null);
    const [activeIndex, setActiveIndex] = useState(0);
    // suppressed right after a pick, until the user types again
    const [dismissed, setDismissed] = useState(false);
    // which argument ("connect A|to B" vs "connect A to B|") suggestions target
    const [cursorPosition, setCursorPosition] = useState(value.length);
    const [historyState, setHistoryState] =
        useState<CommandHistoryState>(IDLE_HISTORY);

    // selectSuggestion queues a target here; applied once `value`'s DOM
    const pendingCursorRef = useRef<number | null>(null);
    useEffect(() => {
        const pending = pendingCursorRef.current;
        if (pending === null) return;
        pendingCursorRef.current = null;
        inputRef.current?.setSelectionRange(pending, pending);
        setCursorPosition(pending);
    }, [value]);

    // A submitted command clears the field from outside
    if (value === "" && historyState.index !== null) {
        setHistoryState(IDLE_HISTORY);
    }

    const suggestion = suggestNodeReference(
        value,
        architecture,
        Math.min(cursorPosition, value.length),
        undefined,
        nodeIndex,
    );
    const options = dismissed ? [] : (suggestion?.matches ?? []);

    // Resets activeIndex during render whenever the suggested argument slot changes
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
        // Otherwise a stale recall from before the suggestion was accepted
        setHistoryState(IDLE_HISTORY);
        inputRef.current?.focus();
    }

    function recallOlder() {
        const result = recallOlderCommand(commands, historyState, value);
        setHistoryState(result.state);
        onChange(result.value);
    }

    function recallNewer() {
        if (historyState.index === null) return;
        const result = recallNewerCommand(commands, historyState);
        setHistoryState(result.state);
        onChange(result.value);
    }

    function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
        if (options.length > 0) {
            switch (event.key) {
                case "ArrowDown":
                    event.preventDefault();
                    setActiveIndex((i) => (i + 1) % options.length);
                    return;
                case "ArrowUp":
                    event.preventDefault();
                    setActiveIndex(
                        (i) => (i - 1 + options.length) % options.length,
                    );
                    return;
                case "Enter":
                    // an already-complete, unambiguous reference should submit command
                    if (
                        suggestion &&
                        suggestionIsCompleteMatch(value, suggestion)
                    ) {
                        return;
                    }
                    event.preventDefault();
                    selectSuggestion(options[activeOptionIndex]);
                    return;
                case "Escape":
                    setDismissed(true);
                    return;
            }
            return;
        }

        switch (event.key) {
            case "ArrowUp":
                event.preventDefault();
                recallOlder();
                break;
            case "ArrowDown":
                event.preventDefault();
                recallNewer();
                break;
        }
    }

    return (
        <form onSubmit={onSubmit} className="w-full border-t border-border p-2">
            <div className="relative flex w-full items-center gap-1.5">
                <span
                    className="shrink-0 font-mono text-sm text-accent"
                    aria-hidden="true"
                >
                    &gt;
                </span>
                <div className="relative min-w-0 max-w-[80ch] flex-1">
                    <input
                        id="command-input"
                        ref={inputRef}
                        type="text"
                        value={value}
                        onChange={(event) => {
                            onChange(event.target.value);
                            setDismissed(false);
                            setHistoryState(IDLE_HISTORY);
                            trackCursor(event.target);
                        }}
                        onKeyDown={handleKeyDown}
                        onKeyUp={(event) => trackCursor(event.currentTarget)}
                        onClick={(event) => trackCursor(event.currentTarget)}
                        onSelect={(event) => trackCursor(event.currentTarget)}
                        placeholder="add node Cache"
                        aria-label="Command"
                        autoComplete="off"
                        maxLength={500}
                        role="combobox"
                        aria-expanded={options.length > 0}
                        aria-controls="command-suggestions"
                        aria-activedescendant={
                            options.length > 0
                                ? `command-suggestion-${options[activeOptionIndex].id}`
                                : undefined
                        }
                        style={{ caretColor: "var(--accent)" }}
                        className="w-full rounded-sm bg-transparent font-mono text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
                    />
                    {options.length > 0 && (
                        <ul
                            id="command-suggestions"
                            role="listbox"
                            className="absolute bottom-full left-0 z-10 mb-1 max-h-40 w-full overflow-y-auto rounded-md border border-border bg-background shadow-md"
                        >
                            {options.map((node, index) => (
                                <li
                                    key={node.id}
                                    id={`command-suggestion-${node.id}`}
                                    role="option"
                                    aria-selected={index === activeOptionIndex}
                                >
                                    <button
                                        type="button"
                                        onMouseDown={(event) =>
                                            event.preventDefault()
                                        }
                                        onClick={() => selectSuggestion(node)}
                                        className={`block w-full truncate px-2.5 py-1.5 text-left font-mono text-sm ${
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
            </div>
            <p className="mt-1 pl-5 text-[11px] text-muted-foreground">
                ↑↓ history · Tab to complete
            </p>
        </form>
    );
}

# Command input (autocomplete + Up/Down recall)

`CommandInput` is a controlled text field that layers two independent behaviors onto one `<input>`: inline node-reference autocomplete and shell-style history recall. On every render it calls `suggestNodeReference(value, architecture, cursorPosition, undefined, nodeIndex)` to compute the current argument's suggestion list; `handleKeyDown` branches entirely on whether that list is non-empty, so Up/Down/Enter/Tab drive the suggestion popover (`ArrowUp`/`ArrowDown` cycle `activeIndex`, `Enter`/`Tab` call `selectSuggestion` unless `suggestionIsCompleteMatch` says the reference is already unambiguous) while the same keys fall through to `recallOlderCommand`/`recallNewerCommand` once there are no suggestions to navigate. Suggestion selection writes the picked node's text back into `value` via `applyNodeSuggestion`, then queues the new caret offset in `pendingCursorRef` because the DOM node doesn't reflect the updated `value` until after this render — a `useEffect` keyed on `value` applies it with `setSelectionRange` next tick.

**Source:** `src/components/command-input.tsx:1-246`

**Autocomplete suggestion flow**

```mermaid
sequenceDiagram
    participant U as User
    participant I as input element
    participant C as CommandInput
    participant S as suggestNodeReference

    U->>I: keystroke
    I->>C: onChange(value)
    C->>C: setDismissed(false)
    C->>C: setHistoryState(IDLE_HISTORY)
    C->>S: suggestNodeReference(value, architecture, cursorPosition, nodeIndex)
    S-->>C: NodeSuggestion { matches }
    C->>C: render suggestion listbox (options.length > 0)

    U->>I: ArrowDown
    I->>C: handleKeyDown
    alt options.length > 0
        C->>C: setActiveIndex((i+1) % options.length)
    end

    U->>I: Tab (accept suggestion)
    I->>C: handleKeyDown
    C->>C: suggestionIsCompleteMatch? (skip if already complete)
    C->>C: selectSuggestion(options[activeOptionIndex])
    C->>C: applyNodeSuggestion(value, suggestion, node)
    C->>C: onChange(applied.value)
    C->>C: pendingCursorRef.current = applied.cursor
    C-->>I: useEffect([value]) -> setSelectionRange(pending)
```

**History recall flow**

```mermaid
sequenceDiagram
    participant U as User
    participant I as input element
    participant C as CommandInput
    participant H as command-history

    U->>I: ArrowDown
    I->>C: handleKeyDown
    alt no suggestions
        C->>H: recallNewerCommand(commands, historyState)
        H-->>C: { state, value }
        C->>C: onChange(value)
    end

    U->>I: ArrowUp (no suggestions)
    I->>C: handleKeyDown -> recallOlder()
    C->>H: recallOlderCommand(commands, historyState, value)
    H-->>C: { state: {index, draft}, value }
    C->>C: onChange(value)
```

A subtle detail the diagram makes visible: `handleKeyDown` checks `options.length > 0` first, so Up/Down is never simultaneously "cycle suggestions" and "recall history" — the moment a suggestion list appears, history recall is fully shadowed by suggestion navigation for those same keys.

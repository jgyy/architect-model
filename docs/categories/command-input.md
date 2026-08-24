# Command input (autocomplete + Up/Down recall)

`handleKeyDown` checks whether `suggestNodeReference`'s suggestion list is non-empty first, routing Up/Down/Enter/Tab to suggestion navigation whenever suggestions exist and only falling through to `recallOlderCommand`/`recallNewerCommand` once that list is empty, so suggestions fully shadow history recall.

**Source:** `src/components/command-input.tsx:1-263`

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

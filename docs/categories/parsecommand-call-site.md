# Sole `parseCommand` call site

`runCommand` (a `useCallback` in `ArchitectureWorkspace`) is the single place in the component tree that calls `parseCommand`. It first trims the input and short-circuits four non-mutating or history commands (`help`, `export`, `undo`, `redo`) without touching the parser; anything else is handed to `parseCommand` along with the current `architecture`, optional `ParseCommandOptions`, and the memoized `nodeIndex`. Only when `parseCommand` reports success does it record undo history, advance `currentStepIndex`, and commit the new `architecture` via `setArchitecture`; every path — success or failure — ends by appending an entry to the command log through `logResult`. Because both the text input form (`handleSubmit`) and programmatic callers like `handleEdgeDelete` funnel through this one function, command parsing, state mutation, and logging stay in lockstep no matter how a command is triggered.

**Source:** `src/components/architecture-workspace.tsx:281-355`

```mermaid
sequenceDiagram
    participant User
    participant Form as handleSubmit
    participant RC as runCommand
    participant PC as parseCommand
    participant State as React state
    participant Log as logResult

    User->>Form: submit event
    Form->>Form: preventDefault(); trim check
    Form->>RC: runCommand(input)
    RC->>RC: trimmed = text.trim()
    alt trimmed is help/export/undo/redo
        RC->>RC: handle locally (bypasses parseCommand)
        RC->>Log: logResult(trimmed, ok, message)
    else generic command
        RC->>PC: parseCommand(trimmed, architecture, options, nodeIndex)
        PC-->>RC: CommandResult
        alt result.ok
            RC->>State: setUndoRedo(recordCommand(...))
            RC->>State: setCurrentStepIndex(nextStepIndexForSameNode(...))
            RC->>State: setArchitecture(result.architecture)
        end
        RC->>Log: logResult(trimmed, result.ok, result.message)
        RC-->>Form: return result
    end
```

The diagram makes visible that `logResult` runs unconditionally on the `parseCommand` branch — a failed parse still gets a log entry — while `setArchitecture` only fires inside the `result.ok` guard, so a rejected command never mutates the graph.

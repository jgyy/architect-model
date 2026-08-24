# Sole `parseCommand` call site

`runCommand`, a `useCallback` in `ArchitectureWorkspace` that both `handleSubmit` and programmatic callers funnel through, is the sole call site for `parseCommand`, short-circuiting `help`/`export`/`undo`/`redo` locally and only committing `setArchitecture(result.architecture)` when `result.ok` is true.

**Source:** `src/components/architecture-workspace.tsx:121-203`

**Dispatch: submit through parseCommand**

```mermaid
sequenceDiagram
    participant User
    participant Form as handleSubmit
    participant RC as runCommand
    participant PC as parseCommand
    participant Log as logResult

    User->>Form: submit event
    Form->>Form: preventDefault()#59; trim check
    Form->>RC: runCommand(input)
    RC->>RC: trimmed = text.trim()
    alt trimmed is help/export/undo/redo
        RC->>RC: handle locally (bypasses parseCommand)
        RC->>Log: logResult(trimmed, ok, message)
    else generic command
        RC->>PC: parseCommand(trimmed, architecture, options, nodeIndex)
        PC-->>RC: CommandResult
    end
```

**Result handling: state commit and logging**

```mermaid
sequenceDiagram
    participant RC as runCommand
    participant State as React state
    participant Log as logResult
    participant Form as handleSubmit

    alt result.ok
        RC->>State: setUndoRedo(recordCommand(...))
        RC->>State: setCurrentStepIndex(nextStepIndexForSameNode(...))
        RC->>State: setArchitecture(result.architecture)
    end
    RC->>Log: logResult(trimmed, result.ok, result.message)
    RC-->>Form: return result
```

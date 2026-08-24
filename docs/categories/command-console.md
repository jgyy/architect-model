# Command console / change log

`ConsolePanel` gates auto-scroll with `stickToBottomRef`, updated only by `handleScroll` from the pre-update scroll position, so the ref tracks whether the user was at the bottom before the change rather than after the container grows.

**Source:** `src/components/console-panel.tsx:1-260`

**Submission and auto-scroll**

```mermaid
sequenceDiagram
    participant U as User
    participant CI as CommandInput
    participant CP as ConsolePanel
    participant WS as onSubmit (parent)
    participant DOM as scrollRef container

    U->>CI: submit command
    CI->>WS: onSubmit(event)
    WS-->>CP: log prop grows (new LogEntry)
    CP->>CP: useEffect [log.length]
    alt stickToBottomRef.current
        CP->>DOM: scrollTop = scrollHeight
    else user scrolled away
        CP-->>DOM: no scroll (position preserved)
    end
```

**Entry rendering and scroll tracking**

```mermaid
sequenceDiagram
    participant U as User
    participant CP as ConsolePanel
    participant DOM as scrollRef container

    CP->>CP: log.map(entry => ...)
    alt entry.ok
        CP-->>U: render CheckCircle2 + entry.message
    else !entry.ok
        CP-->>U: render XCircle + entry.message
    end
    U->>DOM: onScroll
    DOM->>CP: handleScroll updates stickToBottomRef
```

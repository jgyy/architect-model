# Command recall (Up/Down, not undo)

`recallNewerCommand` exits recall, resetting `index` to `null` and restoring the frozen `draft`, rather than merely decrementing, once `index` reaches 0 or `commands` empties — mirroring how a shell restores an unsent line after arrowing past it.

**Source:** `src/lib/command-history.ts:1-50`

**Entering recall and paging older**

```mermaid
stateDiagram-v2
    [*] --> Idle
    Idle: index = null
    Idle --> Idle: edit input (live typing)

    Idle --> Recalling: recallOlderCommand\n(commands.length > 0)\ncapture draft = liveValue, index = 0

    Recalling: index = 0..commands.length-1
    Recalling --> Recalling: recallOlderCommand\nindex = min(index+1, len-1)
```

**Paging newer and exiting recall**

```mermaid
stateDiagram-v2
    Idle: index = null
    Recalling: index = 0..commands.length-1

    Recalling --> Recalling: recallNewerCommand\n(index > 0 and commands not empty)\nindex = min(index-1, len-1)

    Recalling --> Idle: recallNewerCommand\n(index == 0 or commands.length == 0)\nrestore value = draft, index = null
    Recalling --> Idle: submit / manual edit\n(caller resets to IDLE_HISTORY)
```

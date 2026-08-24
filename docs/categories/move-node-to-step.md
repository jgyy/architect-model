# `move node ... to step ...`

This handler filters the source node out of `architecture.nodes`, splices it back in at `targetIndex`, then re-derives every node's `x` from `index * NODE_X_SPACING`; edges stay untouched since they reference node `id`s, not array position.

**Source:** `src/lib/architecture-commands.ts:341-399`

**Command parsing and validation**

```mermaid
flowchart TD
    A["moveNodeMatch = matchFirst(MOVE_NODE_PATTERNS, trimmed)"] -->|no match| Z["fall through to\nUnrecognized command"]
    A -->|match| B["resolveMoveNodeArgs(match[1], nodeIndex, MOVE_NODE_SEPARATORS)"]
    B -->|null| C["error: no 'to step' separator found"]
    B -->|resolved| D["requireNode(sourceLabel, resolved.source)"]
    D -->|not ok| E["return sourceResolution error"]
    D -->|ok| F{"positionText matches /^\d+$/ ?"}
    F -->|no| G["error: not a valid step number"]
    F -->|yes| H{"1 <= targetPosition <= stepCount ?"}
    H -->|no| I["error: step out of range"]
    H -->|yes| J{"targetIndex === currentIndex ?"}
    J -->|yes| K["error: already at that step"]
```

**Node reorder and x-relayout**

```mermaid
flowchart TD
    J{"targetIndex === currentIndex ?"} -->|no| L["withoutNode = nodes.filter(id !== source.id)"]
    L --> M["splice source into withoutNode at targetIndex"]
    M --> N["map: position.x = index * NODE_X_SPACING"]
    N --> O["return ok with reorderedNodes\n(edges untouched)"]
```

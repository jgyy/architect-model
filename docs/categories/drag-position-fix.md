# Drag-position autosave-spam fix

`applyPersistableNodeChanges` filters React Flow's per-frame `position` `NodeChange` events down to those where `dragging !== true`, returning the original `nodes` array by reference when none survive so `architecture-canvas.tsx` skips firing autosave on every in-drag frame.

**Source:** `src/lib/node-changes.ts:1-26`

**Filtering settled position changes**

```mermaid
flowchart TD
    A["applyPersistableNodeChanges(changes, nodes)"] --> B["changes.filter(isSettledPositionChange)"]
    B --> C{"change.type === 'position'\n&& change.dragging !== true"}
    C -->|true, per change| D[kept in persistable]
    C -->|false, per change| E[dropped]
    D --> F{"persistable.length === 0?"}
    E --> F
```

**Returning the reference or the merged result**

```mermaid
flowchart TD
    F{"persistable.length === 0?"}
    F -->|yes| G["return nodes (same reference)"]
    F -->|no| H["return applyNodeChanges(persistable, nodes)"]
```

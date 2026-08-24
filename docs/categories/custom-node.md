# Custom node (rename/delete/highlight)

`ArchitectureNode` reads `HighlightedNodeContext` and `NodeActionsContext` independently every render, so a node mid-rename can simultaneously carry the current-step highlight border while its label is replaced by the editing `<input>`.

**Source:** `src/components/architecture-node.tsx:1-180`

**Entering edit, highlight, and traversal states**

```mermaid
stateDiagram-v2
    [*] --> Idle
    Idle --> AutoEditing: autoEditNodeId === id && consumedAutoEditFor !== id
    Idle --> Editing: onDoubleClick -> startEditing()
    AutoEditing --> Editing
    Idle --> Highlighted: current (id === currentNodeId)
    Idle --> Traversed: traversed (in traversedNodeIds, not current)
```

**Exiting, resetting, and side transitions**

```mermaid
stateDiagram-v2
    Highlighted --> Idle: currentNodeId changes away
    Traversed --> Idle: traversedNodeIds no longer has id
    Editing --> Idle: commitEditing() - draft.trim() === data.label
    Editing --> Idle: commitEditing() - onRename() returns true
    Editing --> Editing: commitEditing() - onRename() false, Enter (refocus input)
    Editing --> Idle: commitEditing(true) - onRename() false, blur (cancelEditing)
    Editing --> Idle: Escape -> cancelEditing()
    Idle --> [*]: onDelete(id) via X button
```

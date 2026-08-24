# Drag-to-reorder steps

`SimulationTimeline` drives native drag-to-reorder with two `useState` values, `draggedIndex` and `dragOverIndex`, calling `onReorder(node.id, index)` from `onDrop` only when `draggedIndex !== null && draggedIndex !== index`, while `onDragEnd` always resets both indices via `endDrag()`.

**Source:** `src/components/simulation-timeline.tsx:1-137`

**Drag start, hover, and drop**

```mermaid
sequenceDiagram
    participant User
    participant Row as "li" row
    participant State as useState (SimulationTimeline)
    participant Parent as onReorder prop

    User->>Row: dragstart on source row
    Row->>State: setDraggedIndex(index)
    Row->>Row: dataTransfer.setData("text/plain", node.id)
    User->>Row: dragover target row
    Row->>Row: event.preventDefault()
    Row->>State: setDragOverIndex(index)
    User->>Row: drop on target row
    Row->>Row: event.preventDefault()
    alt draggedIndex !== null and draggedIndex !== index
        Row->>Parent: onReorder(nodes[draggedIndex].id, index)
    end
```

**Drag-end cleanup**

```mermaid
sequenceDiagram
    participant Row as "li" row
    participant State as useState (SimulationTimeline)

    Row->>Row: dragend fires endDrag()
    Row->>State: setDraggedIndex(null)#59; setDragOverIndex(null)
```

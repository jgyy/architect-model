# `fitView` Debounce

React Flow's `fitView` prop on `<ReactFlow>` only runs once, at mount, so it cannot re-center the camera as nodes are added or removed later. `FitViewOnNodesChange` fills that gap: it watches a `nodeIds` string (the joined ids of `architecture.nodes`, memoized in the parent) and, on every change after the first, schedules `fitView({ duration: 300 })` inside a 300ms `setTimeout`. The effect's cleanup clears that timer before each re-run, so if `nodeIds` changes again within the 300ms window the pending call is cancelled and a fresh one is scheduled — collapsing a burst of rapid mutations into a single animated fit. A `isFirstRun` ref skips the effect's first invocation so this logic never fights the initial `fitView` mount behavior.

**Source:** `src/components/architecture-canvas.tsx:154-189`

**Mount skip and first scheduled fit**

```mermaid
sequenceDiagram
    participant P as Parent (nodeIds memo)
    participant E as FitViewOnNodesChange effect
    participant T as setTimeout(300ms)

    P->>E: mount, nodeIds = "a,b"
    E->>E: isFirstRun.current? yes -> skip, set false

    P->>E: nodeIds changes to "a,b,c"
    E->>T: schedule fitView in 300ms
```

**Reschedule on a rapid second change, then fire**

```mermaid
sequenceDiagram
    participant P as Parent (nodeIds memo)
    participant E as FitViewOnNodesChange effect
    participant T as setTimeout(300ms)
    participant F as fitView({ duration: 300 })

    P->>E: nodeIds changes to "a,b,c,d" (before timer fires)
    E->>T: cleanup cancels previous timer
    E->>T: schedule new fitView in 300ms

    Note over T: 300ms elapse with no further change
    T->>F: fire
    F->>F: fitView({ duration: 300 })
```

The single cleanup-then-reschedule pattern means the component never holds more than one pending timer at a time, so an arbitrarily long burst of edits still produces exactly one `fitView` call, fired 300ms after the last change settles.

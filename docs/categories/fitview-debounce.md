# `fitView` Debounce

`FitViewOnNodesChange` watches a memoized `nodeIds` string and schedules `fitView({ duration: 300 })` in a `setTimeout` whose cleanup cancels any pending timer, collapsing bursts of node mutations into one animated fit 300ms after the last change settles.

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

# Canvas mouse-to-command synthesis

`src/lib/canvas-commands.ts` translates React Flow mouse gestures (drag-connect, delete, double-click rename, drag-reorder, pane double-click to create) into the same plain-text command strings the typed command box accepts, by looking up each node/edge's current label via a shared `findNode` helper and interpolating it into a template string (e.g. `` `connect ${source.data.label} to ${target.data.label}` ``). Every builder returns `string | null`, failing closed to `null` when a referenced node or edge id is not found in the current `Architecture`, so a stale canvas interaction never produces a malformed command. Routing every mouse action back through the text-command parser (rather than mutating state directly) means canvas and typed edits share one code path, one history/undo mechanism, and one validation surface. `isDoubleClick` is a separate concern in the same file: it emulates native double-click detection (time + distance thresholds) for `onPaneClick`, since React Flow's pane click handler doesn't provide one.

**Source:** `src/lib/canvas-commands.ts:1-157`

**Mouse gesture to command builder**

```mermaid
flowchart LR
    subgraph Mouse actions
        A[Drag edge endpoint to delete]
        B[Drag node onto another to connect]
        C[Double-click node label]
        D[Delete-node button]
        E[Drag node between steps]
    end

    A --> F["buildRemoveEdgeCommand(edgeId, architecture)"]
    B --> G["buildConnectCommand(sourceId, targetId, architecture)"]
    C --> H["buildRenameNodeCommand(nodeId, newLabel, architecture)"]
    D --> I["buildRemoveNodeCommand(nodeId, architecture)"]
    E --> J["buildMoveNodeCommand(nodeId, targetPosition, architecture)"]
```

**Builder result to command execution**

```mermaid
flowchart LR
    F["buildRemoveEdgeCommand(edgeId, architecture)"]
    G["buildConnectCommand(sourceId, targetId, architecture)"]
    H["buildRenameNodeCommand(nodeId, newLabel, architecture)"]
    I["buildRemoveNodeCommand(nodeId, architecture)"]
    J["buildMoveNodeCommand(nodeId, targetPosition, architecture)"]

    F -->|edge/nodes found| F1["'remove edge A to B'"]
    G -->|both nodes found| G1["'connect A to B'"]
    H -->|node found| H1["'rename node A to B'"]
    I -->|node found| I1["'remove node A'"]
    J -->|node found| J1["'move node A to step N'"]

    F -.->|not found| N[null]
    G -.->|not found| N
    H -.->|not found| N
    I -.->|not found| N
    J -.->|not found| N

    F1 & G1 & H1 & I1 & J1 --> K[runCommand: same path as typed input]
```

The diagram makes visible that all five builders funnel into the same `null`-on-miss failure branch and the same downstream `runCommand`, so a canvas gesture on a node that has just been deleted elsewhere silently becomes a no-op instead of throwing.

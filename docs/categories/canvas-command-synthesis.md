# Canvas mouse-to-command synthesis

`src/lib/canvas-commands.ts` translates React Flow mouse gestures like drag-connect and double-click rename into the same plain-text command strings the typed command box accepts, funneling both into the same downstream `runCommand`.

**Source:** `src/lib/canvas-commands.ts:1-122`

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

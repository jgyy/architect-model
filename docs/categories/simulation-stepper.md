# Stepper (trace = node array order)

`getTraversedPath` highlights an edge only once both its `source` and `target` ids appear in the traversed-node `Set` built from `nodes[0..currentStepIndex]`, so a fan-out or fan-in edge stays dark until the trace reaches its far endpoint.

**Source:** `src/lib/simulation.ts:14-69`

**Step advancement and clamping**

```mermaid
stateDiagram-v2
    [*] --> Step0: index = 0

    Step0 --> StepN: getNextPlayIndex(index, length)\nnext < length
    StepN --> StepN: getNextPlayIndex(index, length)\nnext < length
    StepN --> Stopped: getNextPlayIndex(index, length)\nnext >= length -> null

    Step0 --> Step0: clampStepIndex\nclamps to [0, length-1]
    StepN --> StepN: clampStepIndex\nclamps to [0, length-1]

    Stopped --> [*]
```

**Traversed-path computation**

```mermaid
stateDiagram-v2
    state "getTraversedPath(architecture, currentStepIndex)" as Traverse {
        [*] --> CollectNodeIds: nodes[0..currentStepIndex]
        CollectNodeIds --> CollectEdgeIds: edge kept if\nsource & target both traversed
        CollectEdgeIds --> [*]
    }

    Step0 --> Traverse
    StepN --> Traverse
```


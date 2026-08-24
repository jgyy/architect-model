# Merge picker dialog

Because `effectiveSource`/`effectiveTarget` are recomputed from `connectGraph` on every render rather than stored as committed choices, they silently fall back to the first still-valid option whenever a prior selection is toggled out of eligibility.

**Source:** `src/components/merge-picker-dialog.tsx:1-542`

**Node, edge & step selection**

```mermaid
flowchart TD
    A[MergePickerDialog opens] --> B[selectedIds = all incoming node ids]
    B --> C{toggle node}
    C --> D[flip id in selectedIds]
    D --> E[drop addedEdges touching that incoming:id]
    B --> F[incoming.edges list]
    F --> G{source & target both selected?}
    G -- no --> G1[row disabled, excluded]
    G -- yes --> H{toggleEdge}
    H --> I[flip id in excludedEdgeIds]
    B --> J[keptEdges = eligible minus excluded]
    B --> R[Insert at step select]
    R --> S[insertAtStep index into current.nodes]
```

**Connect-graph construction and merge**

```mermaid
flowchart TD
    J[keptEdges = eligible minus excluded] --> K[buildConnectGraph current + selectedNodes + keptEdges]
    K --> L[connectableSourceIds]
    L --> M[connectableTargetIds for chosen source]
    M --> N{Add connection}
    N --> O[push to addedEdges]
    O --> P{Remove connection}
    P --> Q[filter addedEdges by source/target]
    J --> T[includedEdgeCount = keptEdges + addedEdges]
    T --> U{Merge button}
    U --> V["onConfirm(selectedIds, excludedEdgeIds, addedEdges, insertAtStep)"]
```

# Autocomplete suggestion ranking

`suggestNodeReference` powers live-typing autocomplete for the node-reference argument(s) of a typed command. It first dispatches on which command pattern (connect, remove-edge, remove-node, rename, move) matches the input, then routes to one of three slot helpers depending on how many node arguments that command takes and where the cursor sits relative to a separator like `to`. Candidate ranking (`rankMatches`) buckets substring matches into exact/prefix/other tiers before sorting alphabetically within each tier, and leans on `findNodesBySubstring`'s index so the lookup costs O(needle length) rather than scanning every node. `bestSeparatorSplit` disambiguates which separator occurrence splits the two arguments by preferring the split whose untouched side is already a complete, existing node label, falling back to the rightmost occurrence otherwise.

**Source:** `src/lib/node-suggestions.ts:1-288`

**Command pattern dispatch**

```mermaid
flowchart TD
    A[suggestNodeReference] --> B{CONNECT_PATTERNS matched?}
    B -- yes --> H[twoSlotSuggestion]
    B -- no --> C{REMOVE_EDGE_PATTERNS matched?}
    C -- yes --> H
    C -- no --> D{REMOVE_NODE_PATTERNS matched?}
    D -- yes --> I[singleSlotSuggestion]
    D -- no --> E{RENAME_NODE_PATTERNS matched?}
    E -- yes --> J[renameNodeSuggestion]
    E -- no --> F{MOVE_NODE_PATTERNS matched?}
    F -- yes --> J
    F -- no --> Null1[return null]
```

**Slot suggestion and match ranking**

```mermaid
flowchart TD
    H[twoSlotSuggestion] --> K1{bestSeparatorSplit found?}
    K1 -- no --> L1[rankMatches on whole rest]
    K1 -- yes --> M{cursor <= separatorStart?}
    M -- yes, still 1st arg --> N1[rankMatches before separator]
    M -- no, 2nd arg --> N2[rankMatches after separator]

    J[renameNodeSuggestion] --> K2{bestSeparatorSplit found?}
    K2 -- no --> I[singleSlotSuggestion]
    K2 -- yes --> P{cursor > separatorStart?}
    P -- yes, editing 2nd arg --> Null2[return null: not a node ref]
    P -- no --> N1

    I --> R[rank: exact=0 / prefix=1 / other=2,<br/>sort by rank then label, slice to limit]
    L1 --> R
    N1 --> R
    N2 --> R
```

The `bestSeparatorSplit` anchoring is what lets a separator word (`to`) appear inside a node's own label without being mistaken for the argument boundary: it only accepts a split as the boundary if the fixed side is a real node label, otherwise it keeps scanning rightward.

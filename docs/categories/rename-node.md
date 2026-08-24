# `rename node`

The `rename node` handler validates the new label via `normalizeLabel` and `duplicateLabelError`, then on success unconditionally overwrites the renamed node's `description` to `Reaches "<newLabel>"`, regardless of what the prior description said.

**Source:** `src/lib/architecture-commands.ts:284-340`

**Matching and label validation**

```mermaid
flowchart TD
    A["matchFirst(RENAME_NODE_PATTERNS, trimmed)"] -->|"no match"| Z1["fall through to next command"]
    A -->|"match"| B["resolveRenameArgs(arg, nodeIndex, RENAME_SEPARATORS)"]
    B -->|"resolved == null"| E1["ok:false — missing 'to' separator"]
    B -->|"resolved"| C["requireNode(sourceLabel, resolved.source)"]
    C -->|"not ok"| E2["return sourceResolution error"]
    C -->|"ok"| D["normalizeLabel(newLabel)"]
    D --> F{"isBlankLabel?"}
    F -->|"yes"| E3["ok:false — label cannot be blank"]
    F -->|"no"| G{"isTooLongLabel?"}
    G -->|"yes"| E4["ok:false — exceeds MAX_LABEL_LENGTH"]
    G -->|"no"| H{"foldLabel(new) == foldLabel(source.label)?"}
    H -->|"yes"| E5["ok:false — already named that"]
    H -->|"no"| I["duplicateLabelError(normalizedNewLabel, nodeIndex)"]
    I -->|"error"| E6["return duplicateError"]
```

**Node rewrite and result**

```mermaid
flowchart TD
    I["duplicateLabelError(normalizedNewLabel, nodeIndex)"] -->|"none"| J["map architecture.nodes"]
    J --> K["matching node: set data.label = normalizedNewLabel"]
    K --> L["set data.description = Reaches &quot;normalizedNewLabel&quot;"]
    J --> M["all other nodes: returned unchanged"]
    L --> N["ok:true — new architecture with renamedNodes"]
```

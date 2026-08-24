# `rename node`

The rename-node handler matches the command against `RENAME_NODE_PATTERNS`, then splits the captured argument into a source label and a new label using `resolveRenameArgs` with `RENAME_SEPARATORS`. After resolving the target node, it runs the new label through the same validation and normalization pipeline as other commands (`normalizeLabel`, blank/length checks, a `foldLabel` case-insensitive self-rename guard, and `duplicateLabelError`) before applying the change. On success it does not just swap `label` on the matching node -- it also rewrites that node's `description` to `Reaches "<newLabel>"`, so the node's embedded description stays consistent with its new name rather than becoming stale text pointing at the old label.

**Source:** `src/lib/architecture-commands.ts:610-666`

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
    I -->|"none"| J["map architecture.nodes"]
    J --> K["matching node: set data.label = normalizedNewLabel"]
    K --> L["set data.description = Reaches &quot;normalizedNewLabel&quot;"]
    J --> M["all other nodes: returned unchanged"]
    L --> N["ok:true — new architecture with renamedNodes"]
```

The diagram makes visible that the `description` rewrite happens only on the renamed node and is unconditional on success -- there is no check for whether the old description already referenced the old label, so a node whose description said something unrelated to "reaches" is silently replaced too.

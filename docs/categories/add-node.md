# `add node`

`ADD_NODE_PATTERNS` matches four command phrasings via `matchFirst`, runs the captured label through blank/too-long/duplicate checks, then builds an `ArchitectureNode` positioned at `architecture.nodes.length * NODE_X_SPACING` whenever `options.position` is absent, preserving left-to-right ordering.

**Source:** `src/lib/architecture-commands.ts:57-62,107-137`

**Matching and guard checks**

```mermaid
flowchart TD
    A["trimmed input"] --> B{"matchFirst(ADD_NODE_PATTERNS)"}
    B -- "no match" --> Z["fall through to next command type"]
    B -- "match" --> C["label = normalizeLabel(match[1])"]
    C --> D{"isBlankLabel(label)?"}
    D -- yes --> E["ok: false — blank label error"]
    D -- no --> F{"isTooLongLabel(label)?"}
    F -- yes --> G["ok: false — exceeds MAX_LABEL_LENGTH"]
    F -- no --> H{"duplicateLabelError(label, nodeIndex)?"}
    H -- yes --> I["ok: false — node already exists"]
```

**Node construction and result**

```mermaid
flowchart TD
    H{"duplicateLabelError(label, nodeIndex)?"}
    H -- no --> J["build ArchitectureNode:\nid = uniqueNodeId(slugify(label))\nposition = options.position ?? (nodes.length * NODE_X_SPACING, 0)\ndata = { label, description }"]
    J --> K["return ok: true with node appended to architecture.nodes"]
    K --> L["message: Added node as simulation step N"]
```

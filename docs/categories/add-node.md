# `add node`

`ADD_NODE_PATTERNS` matches four phrasings ("add node", "create node", "new node", "add a node called") against the trimmed command via `matchFirst`, capturing everything after the verb as the label. Once matched, `parseCommand` runs the label through three guard checks in order -- blank, too long, then duplicate -- before building the new `ArchitectureNode`. Because every node in this app also doubles as a simulation step (nodes are rendered left-to-right as a trace), the new node is placed at `architecture.nodes.length * NODE_X_SPACING` when no explicit `options.position` is given, and the success message reports its 1-based step number rather than just confirming creation.

**Source:** `src/lib/architecture-commands.ts:587-592,648-679`

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

The diagram surfaces a detail easy to miss in the code: this handler never checks how the command originated -- it simply falls back to the spacing formula whenever `options.position` is absent. Per `ParseCommandOptions`'s doc comment, that field is only ever supplied by canvas-driven node creation, so a label typed into the command box always lands via the formula, keeping the left-to-right simulation ordering intact.

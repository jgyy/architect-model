# `remove node` (cascading delete)

The `remove node <label>` command resolves the label via `findNodeOrAmbiguity`/`requireNode`, then cascades the delete in a single `edges.filter` pass that removes every inbound and outbound edge referencing the deleted node's id.

**Source:** `src/lib/architecture-commands.ts:212-233`

**Command matching and node resolution**

```mermaid
flowchart TD
    A["matchFirst(REMOVE_NODE_PATTERNS, trimmed)"] -->|no match| Z["fall through to next command"]
    A -->|match| B["label = removeNodeMatch[1].trim()"]
    B --> C["findNodeOrAmbiguity(label, nodeIndex)"]
    C --> D["requireNode(label, ...)"]
    D -->|"resolution.ok === false"| E["return resolution (not found / ambiguous)"]
```

**Cascading edge filter and result**

```mermaid
flowchart TD
    D["requireNode(label, ...)"]
    D -->|"resolution.ok === true"| F["node = resolution.node"]
    F --> G["nodes: architecture.nodes.filter(n.id !== node.id)"]
    F --> H["edges: architecture.edges.filter(edge.source !== node.id && edge.target !== node.id)"]
    G --> I["return ok: true, architecture: { nodes, edges }"]
    H --> I
    I --> J["message: Removed node and its simulation step"]
```

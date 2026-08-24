# `remove edge`

The `remove edge` command resolves each endpoint via `requireNode`, then locates the edge in O(1) through `nodeIndex.edgesBySourceTarget`, but still removes it with an O(n) `edges.filter` scan since the map isn't used for deletion.

**Source:** `src/lib/architecture-commands.ts:245-283`

**Command matching and endpoint validation**

```mermaid
flowchart TD
    A["matchFirst(REMOVE_EDGE_PATTERNS, trimmed)"] -->|no match| Z1["fall through to next command"]
    A -->|match| B["resolveConnectionEndpoints(rest, nodeIndex, DISCONNECT_SEPARATORS)"]
    B -->|null: no separator found| E1["ok: false - couldn't find to/from/and separator"]
    B -->|resolved| C["requireNode(sourceLabel, resolved.source)"]
    C -->|not ok: null or ambiguous| E2["ok: false - no node / ambiguous label"]
    C -->|ok| D["requireNode(targetLabel, resolved.target)"]
    D -->|not ok: null or ambiguous| E3["ok: false - no node / ambiguous label"]
```

**Edge lookup and removal**

```mermaid
flowchart TD
    D["requireNode(targetLabel, resolved.target)"]
    D -->|ok| F["edgeKey(source.id, target.id)"]
    F --> G["nodeIndex.edgesBySourceTarget.get(key)"]
    G -->|undefined| E4["ok: false - No edge from A to B"]
    G -->|found edge| H["edges.filter(e => e.id !== edge.id)"]
    H --> I["ok: true - Removed edge from A to B"]
```

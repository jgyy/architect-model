# `remove edge`

This slice matches a `remove edge <A> ... <B>` command, then splits the remainder on the `DISCONNECT_SEPARATORS` ("to"/"from"/"and") via `resolveConnectionEndpoints` to find candidate source/target labels. Each endpoint is resolved through `requireNode`, which turns a `null` or ambiguous (array) match into an error message before any mutation happens. Only once both endpoints resolve to single nodes does the code look up the edge by `edgeKey(source.id, target.id)` in `nodeIndex.edgesBySourceTarget` and, if found, filter it out of `architecture.edges` by id — leaving nodes and all other edges untouched.

**Source:** `src/lib/architecture-commands.ts:571-609`

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

The edge lookup is O(1) via the precomputed `edgesBySourceTarget` map rather than a linear scan of `architecture.edges`, but the actual removal still filters the full edges array by id — the map is used only to find the target, not to delete it.

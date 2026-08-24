# `connect` (add edge)

Because the one-outgoing/one-incoming constraint already keeps the graph a simple chain, `wouldCreateCycle` only needs to catch the edge case where the new edge closes that chain back on itself.

**Source:** `src/lib/architecture-commands.ts:139-211`

**Endpoint resolution and guard checks**

```mermaid
flowchart TD
    A[connectMatch via matchFirst] --> B{resolveConnectionEndpoints}
    B -- null --> B1[fail: no to/and separator]
    B -- resolved --> C[requireNode: source]
    C -- fail --> C1[fail: no node / ambiguous]
    C -- ok --> D[requireNode: target]
    D -- fail --> D1[fail: no node / ambiguous]
    D -- ok --> E{source.id === target.id}
    E -- yes --> E1[fail: can't connect to itself]
    E -- no --> F{outgoingBySource has source}
    F -- same target --> F1[fail: edge already exists]
    F -- different target --> F2[fail: one outgoing connection only]
    F -- none --> G{incomingByTarget has target}
    G -- yes --> G1[fail: one incoming connection only]
    G -- no --> H{wouldCreateCycle source target}
    H -- true --> H1[fail: would create a circular loop]
```

**Edge construction and result**

```mermaid
flowchart TD
    H{wouldCreateCycle source target}
    H -- false --> I[build edge: edge-source-target]
    I --> J[return ok: architecture with new edge]
```

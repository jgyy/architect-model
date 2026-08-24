# `connect` (add edge)

This slice handles the `connect <A> to <B>` command: it resolves both endpoint labels via `resolveConnectionEndpoints`/`requireNode`, then runs a sequence of guard checks — self-loop, an existing outgoing edge on the source, an existing incoming edge on the target, and a cycle check via `wouldCreateCycle` — before appending a new edge. The one-outgoing/one-incoming constraint keeps the architecture graph a simple chain (matching the simulation player's step-by-step model), and `wouldCreateCycle` walks forward from the target through `outgoingBySource` looking for a path back to the source, which also guards against runaway loops since the chain is otherwise singly-linked. Each failure path returns a specific, user-facing message rather than a generic error, reusing the already-resolved node labels for readability.

**Source:** `src/lib/architecture-commands.ts:680-752`

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

The outgoing/incoming checks run before the cycle check, so on a graph that is already a simple chain, `wouldCreateCycle` only ever needs to catch the case where the new edge closes the chain back on itself.

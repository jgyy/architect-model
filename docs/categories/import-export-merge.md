# Import / export / merge

This slice implements the three ways an `Architecture` crosses a file/JSON boundary. `serializeArchitecture` pretty-prints `{ nodes, edges }` with 2-space indentation specifically so a downloaded file is readable if a reviewer opens it directly. `parseImportedArchitecture` treats imported JSON as untrusted: it parses, runs the structural type guard `isValidArchitecture`, then `validateImportedArchitecture` re-checks invariants the rest of the app assumes already hold (unique ids/labels, finite positions, edges that reference real nodes, at most one outgoing and one incoming edge per node) and rejects cycles via `findCyclicNodeId`, a topological walk starting from in-degree-zero nodes. `mergeSelectedArchitecture` folds a chosen subset of a second architecture into the current one, deconflicting ids (`uniqueNodeId`) and labels (`uniqueLabel`) against the current graph, remapping both the incoming edges and any manually added connect edges through that same id remap, then splicing the result into `current.nodes` at `insertAtStep` and repositioning only the spliced-in and trailing nodes by `NODE_X_SPACING`.

**Source:** `src/lib/architecture-io.ts:20-348`

**Serialize and validate on import**

```mermaid
flowchart TD
    A["architecture-io.ts"] --> B["serializeArchitecture"]
    A --> C["parseImportedArchitecture"]

    B --> B1["JSON.stringify(nodes, edges, pretty-printed)"]

    C --> C1{"JSON.parse(raw)"}
    C1 -- throws --> Cerr1["ok: false, not valid JSON"]
    C1 -- parsed --> C2{"isValidArchitecture(parsed)"}
    C2 -- false --> Cerr2["ok: false, wrong shape"]
    C2 -- true --> C3["validateImportedArchitecture"]
    C3 --> C3struct["unique ids/labels, finite positions, valid edge refs, degree at most 1 per side"]
    C3 --> C3cyc["findCyclicNodeId"]
    C3struct -- problem found --> Cerr3["ok: false, with message"]
    C3cyc -- cycle found --> Cerr3
    C3cyc -- acyclic --> Cok["ok: true, architecture"]
```

**Merge a selected subset into the current architecture**

```mermaid
flowchart TD
    A["architecture-io.ts"] --> D["mergeSelectedArchitecture"]

    D --> D1["filter selected nodes/edges, minus excludedEdgeIds"]
    D1 --> D2["uniqueNodeId + uniqueLabel resolve id/label collisions"]
    D2 --> D3["remap incomingEdges via idRemap; remap addedEdges via resolveConnectEndpoint"]
    D3 --> D4["splice at insertAtStep, reposition by NODE_X_SPACING"]
    D4 --> Dok["ok: true, merged architecture + renamedLabels"]
```

One detail the diagram makes visible: `validateImportedArchitecture` and `mergeSelectedArchitecture` share the same folded-label uniqueness rule (`foldLabel`), but they respond to a collision differently — import rejects the whole file, while merge silently renames the incoming node and records it in `renamedLabels`.

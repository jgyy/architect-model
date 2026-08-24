# Import / export / merge

`validateImportedArchitecture` and `mergeSelectedArchitecture` both enforce label uniqueness via `foldLabel`, but import rejects the whole file on a collision while merge silently renames the incoming node and records it in `renamedLabels`.

**Source:** `src/lib/architecture-io.ts:23-407`

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

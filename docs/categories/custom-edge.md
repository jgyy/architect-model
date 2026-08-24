# Custom edge (self-loop path)

`ArchitectureEdge` is a custom React Flow edge renderer. Because a standard bezier path degenerates
when an edge's source and target are the same node, the component checks `source === target` and, for
self-loops, computes a path by hand: `getSelfLoopPath` raises an apex above both endpoints
(`Math.min(sourceY, targetY) - SELF_LOOP_HEIGHT`) and builds a cubic bezier `M ... C ...` string whose
two control points sit at that apex, offset left/right by `SELF_LOOP_CONTROL_OFFSET_X`. For ordinary
edges it falls back to React Flow's `getBezierPath`, additionally flipping `sourcePosition`/
`targetPosition` to `Left`/`Right` when `targetX < sourceX` so the curve doesn't loop backward when the
target node sits to the left of the source. Both branches yield the same `[path, labelX, labelY]` tuple,
which feeds the visible `BaseEdge`, a wider invisible hover path, and a hover/focus-revealed delete
button rendered via `EdgeLabelRenderer`.

**Source:** `src/components/architecture-edge.tsx:1-107`

**Path computation: self-loop vs. bezier fork**

```mermaid
flowchart TD
    A["ArchitectureEdge render\n(sourceX, sourceY, targetX, targetY, positions)"] --> B{"isSelfLoop:\nsource === target?"}

    B -- yes --> C["getSelfLoopPath(sourceX, sourceY, targetX, targetY)"]
    C --> D["apexY = min(sourceY, targetY) - SELF_LOOP_HEIGHT"]
    D --> E["path = M sourceX sourceY C ... apexY ... apexY ... targetX targetY\n(control points offset by SELF_LOOP_CONTROL_OFFSET_X)"]
    E --> F["labelX = (sourceX + targetX) / 2\nlabelY = apexY"]

    B -- no --> G{"reversed:\ntargetX < sourceX?"}
    G -- yes --> H["getBezierPath with\nsourcePosition=Left, targetPosition=Right"]
    G -- no --> I["getBezierPath with\noriginal sourcePosition/targetPosition"]
    H --> J["[edgePath, labelX, labelY]"]
    I --> J

    F --> K["edgePath, labelX, labelY"]
    J --> K
```

**Unified edge rendering**

```mermaid
flowchart TD
    K["edgePath, labelX, labelY"] --> L["BaseEdge (visible path)\n+ invisible wide hover path\n+ EdgeLabelRenderer delete button at (labelX, labelY)"]
```

The self-loop branch and the ordinary branch both terminate in the same `[path, labelX, labelY]`
shape, which is why the render path below the fork stays a single, un-duplicated flow.

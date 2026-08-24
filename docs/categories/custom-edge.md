# Custom edge (self-loop path)

`ArchitectureEdge` detects `source === target` and hand-computes a self-loop path via `getSelfLoopPath`, placing the curve's apex above both endpoints at `min(sourceY, targetY) - SELF_LOOP_HEIGHT`, with control points offset horizontally by `SELF_LOOP_CONTROL_OFFSET_X`.

**Source:** `src/components/architecture-edge.tsx:1-120`

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

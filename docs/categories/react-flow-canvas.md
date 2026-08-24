# React Flow canvas

`ArchitectureCanvas` bridges the app's `Architecture` state and React Flow's render state through `reconcileRenderNodes`, which preserves the live drag position of whichever node `draggingNodeIdRef` currently identifies, so drags never jump mid-gesture.

**Source:** `src/components/architecture-canvas.tsx:1-383`

**Prop sync and interaction handlers**

```mermaid
flowchart TD
    A[architecture.nodes prop changes] -->|nodes !== syncedFrom| B[reconcileRenderNodes]
    B -->|preserves position of draggingNodeIdRef| C[renderNodes state]
    C --> RF[ReactFlow]

    RF -->|onNodesChange| D[handleNodesChange]
    D --> D1[applyNodeChanges -> renderNodes]
    D --> D2[applyPersistableNodeChanges -> onNodesChange prop]

    RF -->|onConnect| E[handleConnect] --> E1[onEdgeCreate]
    RF -->|onPaneClick| F[handlePaneClick]
    F -->|isDoubleClick check| G[onNodeCreate -> setAutoEditNodeId]
    Panel[Panel: Add node button] -->|click| H[handleAddNodeClick] --> G
```

**ReactFlow's rendered children and fit-view**

```mermaid
flowchart TD
    RF[ReactFlow]
    RF --> NT[nodeTypes: ArchitectureNodeCard]
    RF --> ET[edgeTypes: ArchitectureEdgeCard]
    RF --> BG[Background: dotted]
    RF --> CTRL[Controls]
    RF -->|nodes.length <= MINIMAP_NODE_LIMIT| MM[MiniMap]
    RF --> DG[DiagramGuide]
    RF --> FV[FitViewOnNodesChange]
    FV -->|nodeIds changed, debounced 300ms| FitView[fitView]
```

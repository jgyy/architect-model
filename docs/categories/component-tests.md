# Component tests

`src/components/test/` holds one Vitest spec per component in `src/components/`, each
declaring `// @vitest-environment jsdom` and rendering with React Testing Library. Components
are exercised as pure, callback-driven units: tests build props with `vi.fn()` mocks (e.g.
`onNodeCreate`, `onNodeRename`, `onEdgeDelete` in `architecture-canvas.test.tsx`) and assert
on both rendered output and which mock was called with what arguments, rather than reaching
into implementation details. Each file's `describe` blocks are grouped by user-facing
behavior (typing, suggestions, history recall, submitting) instead of by internal function,
so the test names double as a behavior checklist for the component.

**Source:** `src/components/test/`

**Canvas & graph test coverage**

```mermaid
flowchart LR
    subgraph canvas_group["Canvas & graph"]
        AC["architecture-canvas.test.tsx"]
        AN["architecture-node.test.tsx"]
        AE["architecture-edge.test.tsx"]
        DG["diagram-guide.test.tsx"]
    end

    AC -->|covers| C1["ArchitectureCanvas\n+ reconcileRenderNodes"]
    AN -->|covers| C2["ArchitectureNode"]
    AE -->|covers| C3["ArchitectureEdge\n(via ArchitectureCanvas)"]
    DG -->|covers| C4["DiagramGuide"]
```

**Workspace shell & simulation test coverage**

```mermaid
flowchart LR
    subgraph workspace_group["Workspace shell"]
        AW["architecture-workspace.test.tsx"]
        CI["command-input.test.tsx"]
        CP["console-panel.test.tsx"]
        MP["merge-picker-dialog.test.tsx"]
    end

    subgraph sim_group["Simulation"]
        SP["simulation-panel.test.tsx"]
        ST["simulation-timeline.test.tsx"]
    end

    AW -->|covers| C5["ArchitectureWorkspace"]
    CI -->|covers| C6["CommandInput"]
    CP -->|covers| C7["ConsolePanel"]
    MP -->|covers| C8["MergePickerDialog"]
    SP -->|covers| C9["SimulationPanel"]
    ST -->|covers| C10["SimulationTimeline"]
```

One subtlety the diagram surfaces: `architecture-edge.test.tsx` does not import
`ArchitectureEdge` directly — it renders `ArchitectureCanvas` and asserts on the edges React
Flow produces, since edge rendering only makes sense inside a live canvas/provider context.

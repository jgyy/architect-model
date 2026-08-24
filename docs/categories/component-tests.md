# Component tests

Each spec in `src/components/test/` renders its component with React Testing Library under `// @vitest-environment jsdom`, then asserts on rendered output and `vi.fn()` mock callback invocations rather than internal component state.

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
        AWC["architecture-workspace-core.test.tsx"]
        AWI["architecture-workspace-io.test.tsx"]
        AWM["architecture-workspace-merge.test.tsx"]
        CI["command-input.test.tsx"]
        CP["console-panel.test.tsx"]
        MP["merge-picker-dialog.test.tsx"]
    end

    subgraph sim_group["Simulation"]
        SP["simulation-panel.test.tsx"]
        ST["simulation-timeline.test.tsx"]
    end

    AWC -->|covers| C5["ArchitectureWorkspace\n(rendering, commands, undo/redo)"]
    AWI -->|covers| C5
    AWM -->|covers| C5
    CI -->|covers| C6["CommandInput"]
    CP -->|covers| C7["ConsolePanel"]
    MP -->|covers| C8["MergePickerDialog"]
    SP -->|covers| C9["SimulationPanel"]
    ST -->|covers| C10["SimulationTimeline"]
```

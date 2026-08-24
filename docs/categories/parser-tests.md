# Parser tests (7 files, 1,887 lines)

These seven files test `parseCommand` against hand-built `Architecture` fixtures rather than mocks, with the add/remove-node, rename-node, connect, and remove-edge files together accounting for 1,512 lines because adversarial label cases are each asserted individually rather than table-driven.

**Source:** `src/lib/test/architecture-commands-*.test.ts`

**Node and edge command tests**

```mermaid
flowchart TB
    PC["parseCommand\n(src/lib/architecture-commands.ts)"]

    subgraph NODE["architecture-commands-node.test.ts (422 lines)"]
        N1["add / remove node"]
        N2["label validation\n(blank, dup, max length,\nzero-width, NFC/NFD)"]
        N3["findNodesBySubstring"]
    end

    subgraph RENAME["architecture-commands-rename.test.ts (400 lines)"]
        RN1["rename node"]
        RN2["ambiguous label / blank-target\nseparator edge cases"]
    end

    subgraph EDGE["architecture-commands-edge.test.ts (452 lines)"]
        E1["connect"]
        E2["fan-out / fan-in / self-loop rejection"]
        E3["buildNodeIndex\n(O(1) source/target lookup)"]
    end

    subgraph REDGE["architecture-commands-remove-edge.test.ts (238 lines)"]
        RE1["remove edge"]
        RE2["wouldCreateCycle"]
    end

    PC --> NODE
    PC --> RENAME
    PC --> EDGE
    PC --> REDGE
```

**Reorder, simulation, and parsing tests**

```mermaid
flowchart TB
    PC["parseCommand\n(src/lib/architecture-commands.ts)"]

    subgraph REORDER["architecture-commands-reorder.test.ts (198 lines)"]
        R1["move node <label> to step <n>"]
        R2["x-position recompute,\ny preserved"]
    end

    subgraph SIM["architecture-commands-simulation.test.ts (104 lines)"]
        S1["auto-generated simulation\nstep description on add"]
        S2["step removed with its node"]
    end

    subgraph PARSE["architecture-commands-parsing.test.ts (73 lines)"]
        P1["unrecognized command\n+ usage hint"]
        P2["missing separator /\nblank source label"]
    end

    PC --> REORDER
    PC --> SIM
    PC --> PARSE
```

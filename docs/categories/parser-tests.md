# Parser tests (5 files, 1,873 lines)

These five files test `parseCommand` against hand-built `Architecture` fixtures rather than mocks, with the node and edge files alone accounting for 1,498 lines because adversarial label cases are each asserted individually rather than table-driven.

**Source:** `src/lib/test/architecture-commands-*.test.ts`

**Node and edge command tests**

```mermaid
flowchart TB
    PC["parseCommand\n(src/lib/architecture-commands.ts)"]

    subgraph NODE["architecture-commands-node.test.ts (814 lines)"]
        N1["add/remove/rename node"]
        N2["label validation\n(blank, dup, max length,\nzero-width, NFC/NFD)"]
        N3["findNodesBySubstring"]
    end

    subgraph EDGE["architecture-commands-edge.test.ts (684 lines)"]
        E1["connect / remove edge"]
        E2["fan-out / fan-in / self-loop rejection"]
        E3["wouldCreateCycle"]
        E4["buildNodeIndex\n(O(1) source/target lookup)"]
    end

    PC --> NODE
    PC --> EDGE
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

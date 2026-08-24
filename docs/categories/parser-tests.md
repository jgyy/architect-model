# Parser tests (5 files, 1,873 lines)

These five files are the test suite for `src/lib/architecture-commands.ts`, split by command family rather than kept as one file: node commands (add/remove/rename/find), edge commands (connect/remove edge/cycle detection), step reordering, simulation-step side effects, and generic command parsing/error paths. All five import `parseCommand` (plus, where relevant, the exported helpers `buildNodeIndex`, `wouldCreateCycle`, and `findNodesBySubstring`) directly from `@/lib/architecture-commands` and drive it with hand-built `Architecture` fixtures rather than mocking anything, so each test asserts on the real `result.ok` / `result.message` / mutated-architecture shape the parser returns. The edge and node files are by far the largest because they also cover adversarial label input -- duplicate/ambiguous references, zero-width and NFC/NFD Unicode variants, over-length labels, and fan-in/fan-out/cycle rejection -- alongside the happy path for each command.

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

The size split is uneven on purpose: node and edge commands together account for 1,498 of the 1,873 lines because ambiguous-label and cycle-detection edge cases are each asserted individually rather than table-driven, while the parsing file stays at 5 tests because it only needs to prove the fallback/error path, not re-cover every command's happy path.

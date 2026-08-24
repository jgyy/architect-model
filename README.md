# architect-model

A small web app for updating a system architecture (nodes + edges) via text input, and exploring a
simulation trace through it. Visual editing mirrors text editing - every mouse action runs the same command a typed instruction would.

## Demo proof

https://www.youtube.com/watch?v=ILF7BVzN8e8

```mermaid
graph LR
    Internet:::done -->|traversed| WebServer["Web Server"]:::done -->|traversed| Database:::current
    Database -.->|"add node Cache<br/>connect Database to Cache"| Cache:::added
    classDef done stroke:#dc2626,color:#dc2626,stroke-width:2px
    classDef current fill:#f59e0b,stroke:#d97706,color:#fff,stroke-width:3px
    classDef added fill:#22c55e,stroke:#16a34a,color:#fff
```

Red = traversed, amber = current, dashed green = added; five real screenshots of the same app,
saved to `docs/demo/`:

<table>
<tr><td align="center"><img src="docs/demo/1-before.png" width="100%"><br><b>1. Before</b> - the seeded architecture, step 1 of 3.</td></tr>
<tr><td align="center"><img src="docs/demo/2-after.png" width="100%"><br><b>2. After</b> - <code>add node Cache</code> + <code>connect Database to Cache</code>.</td></tr>
<tr><td align="center"><img src="docs/demo/3-invalid-command.png" width="100%"><br><b>3. Validation</b> - an invalid command rejected inline; architecture unchanged.</td></tr>
<tr><td align="center"><img src="docs/demo/4-simulation-mid.png" width="100%"><br><b>4. Simulating</b> - current step ringed amber, traversed nodes/edges red.</td></tr>
<tr><td align="center"><img src="docs/demo/5-simulation-final.png" width="100%"><br><b>5. Full trace</b> - final step; the whole attacker path traversed.</td></tr>
</table>

## Run locally

```bash
npm install
npm run dev
```

Open http://localhost:3000. `npm test` runs the unit tests; `npm run check` runs lint, typecheck,
format, and tests together. Sample JSON files for import/export/merge are in `docs/`.

## Supported commands

Typed into the console's command input. Node references match case-insensitively and by substring;
an unrecognized command or an ambiguous reference is rejected inline in the log. A dropdown
autocompletes node names as you type.

| Command                         | Aliases                                  | Example                           | Effect                                                        |
| -------------------------------- | ------------------------------------------ | ------------------------------------ | ---------------------------------------------------------------- |
| `add node <label>`              | `create node`, `new node`                | `add node Cache`                  | Adds a node as the next simulation step.                      |
| `connect <A> to <B>`            | `connect A and B`, `link A to/and B`     | `connect Web Server to Cache`     | Adds an edge; one outgoing/incoming edge per node, no cycles. |
| `remove node <label>`           | `delete node`                            | `remove node Cache`               | Removes the node, its edges, and its step.                    |
| `remove edge <A> to <B>`        | `delete edge`, `disconnect A from/and B` | `remove edge Web Server to Cache` | Removes the edge.                                             |
| `rename node <A> to <B>`        | `relabel node A to B`                    | `rename node Cache to Redis`      | Renames the node everywhere it's referenced.                  |
| `move node <label> to step <n>` | `reorder node`                           | `move node Cache to step 2`       | Reorders the node's simulation step.                          |
| `export`                        | -                                         | `export`                          | Downloads the architecture as `architecture.json`.            |
| `undo` / `redo`                 | -                                         | `undo`                            | Reverts / re-applies the last command.                        |

## Where to point

Quick index from feature to implementation - for checking a specific claim against the code without
hunting for it. Grouped by the assignment's own required/bonus split, 32 categories total; each
row links to a focused Mermaid diagram under `docs/categories/`.

| Category             | Area                                       | File(s)                                              | Diagram                                                          |
| --------------------- | ------------------------------------------- | ------------------------------------------------------ | ------------------------------------------------------------------- |
| Required - commands  | Command parser entry point (all 6 verbs)   | `src/lib/architecture-commands.ts:425-731`           | [view](docs/categories/command-parser-entry-point.md)            |
| Required - commands  | `add node`                                 | `src/lib/architecture-commands.ts:408-413,444-475`   | [view](docs/categories/add-node.md)                               |
| Required - commands  | `connect` (add edge)                       | `src/lib/architecture-commands.ts:476-548`           | [view](docs/categories/connect-add-edge.md)                       |
| Required - commands  | `remove node` (cascading delete)           | `src/lib/architecture-commands.ts:549-570`           | [view](docs/categories/remove-node.md)                            |
| Required - commands  | `remove edge`                              | `src/lib/architecture-commands.ts:571-609`           | [view](docs/categories/remove-edge.md)                            |
| Required - commands  | `rename node`                              | `src/lib/architecture-commands.ts:610-666`           | [view](docs/categories/rename-node.md)                            |
| Required - commands  | `move node ... to step ...`                | `src/lib/architecture-commands.ts:667-728`           | [view](docs/categories/move-node-to-step.md)                      |
| Required - commands  | Suffix-trie substring index                | `src/lib/architecture-commands.ts:84-199`            | [view](docs/categories/suffix-trie-index.md)                      |
| Required - commands  | Regex fragments & label normalization      | `src/lib/node-reference.ts:1-75`                     | [view](docs/categories/label-normalization.md)                    |
| Required - commands  | Unrecognized / ambiguous command errors    | `src/lib/architecture-commands.ts:201-214,729-731`   | [view](docs/categories/command-errors.md)                         |
| Required - commands  | Sole `parseCommand` call site              | `src/components/architecture-workspace.tsx:281-355`  | [view](docs/categories/parsecommand-call-site.md)                 |
| Required - commands  | Autocomplete suggestion ranking            | `src/lib/node-suggestions.ts:1-288`                  | [view](docs/categories/autocomplete-ranking.md)                   |
| Required - display   | React Flow canvas                          | `src/components/architecture-canvas.tsx:1-328`       | [view](docs/categories/react-flow-canvas.md)                      |
| Required - display   | Data model (React Flow-compatible types)   | `src/types/architecture.ts:1-16`                     | [view](docs/categories/data-model.md)                             |
| Required - display   | Custom node (rename/delete/highlight)      | `src/components/architecture-node.tsx:1-173`         | [view](docs/categories/custom-node.md)                            |
| Required - display   | Custom edge (self-loop path)               | `src/components/architecture-edge.tsx:1-107`         | [view](docs/categories/custom-edge.md)                            |
| Required - display   | Command console / change log               | `src/components/console-panel.tsx:1-246`             | [view](docs/categories/command-console.md)                        |
| Required - display   | Command input (autocomplete + Up/Down)     | `src/components/command-input.tsx:1-246`             | [view](docs/categories/command-input.md)                          |
| Required - display   | Canvas mouse-to-command synthesis          | `src/lib/canvas-commands.ts:1-100`                   | [view](docs/categories/canvas-command-synthesis.md)               |
| Bonus - simulation   | Stepper (trace = node array order)         | `src/lib/simulation.ts:12-51`                        | [view](docs/categories/simulation-stepper.md)                     |
| Bonus - simulation   | Panel (Prev/Next/Play/Pause)               | `src/components/simulation-panel.tsx:1-129`          | [view](docs/categories/simulation-panel.md)                       |
| Bonus - simulation   | Drag-to-reorder steps                      | `src/components/simulation-timeline.tsx:1-126`       | [view](docs/categories/drag-reorder-steps.md)                     |
| Bonus - extras       | Import / export / merge                    | `src/lib/architecture-io.ts:20-348`                  | [view](docs/categories/import-export-merge.md)                    |
| Bonus - extras       | Merge picker dialog                        | `src/components/merge-picker-dialog.tsx:1-458`       | [view](docs/categories/merge-picker-dialog.md)                    |
| Bonus - extras       | Undo/redo (two-stack model)                | `src/lib/undo-history.ts:14-85`                      | [view](docs/categories/undo-redo.md)                              |
| Bonus - extras       | Persistence (`localStorage`) + tab sync    | `src/lib/persistence.ts:24,64-170`                   | [view](docs/categories/persistence-tab-sync.md)                   |
| Bonus - extras       | Command recall (Up/Down, not undo)         | `src/lib/command-history.ts:1-41`                    | [view](docs/categories/command-recall.md)                         |
| Performance          | MiniMap node-count guard                   | `src/components/architecture-canvas.tsx:114,291-301` | [view](docs/categories/minimap-guard.md)                          |
| Performance          | `fitView` debounce                         | `src/components/architecture-canvas.tsx:116-134`     | [view](docs/categories/fitview-debounce.md)                       |
| Performance          | Drag-position autosave-spam fix            | `src/lib/node-changes.ts:1-20`                       | [view](docs/categories/drag-position-fix.md)                      |
| Tests                | Parser tests (5 files, 1,873 lines)        | `src/lib/test/architecture-commands-*.test.ts`       | [view](docs/categories/parser-tests.md)                           |
| Tests                | Component tests                            | `src/components/test/`                               | [view](docs/categories/component-tests.md)                        |

## History, simulation & multi-tab sync

The command log, architecture, current step, and playback speed persist to `localStorage`, restore on reload (paused), and sync across tabs via `storage` events; **Clear history** resets to the seed.
The Simulation panel steps through `architecture.nodes` in order - **Prev**/**Next** navigate, **Play**/**Pause** auto-advance at 0.5x-4x, current node ringed, crossed nodes/edges red; steps drag/reorder via `move node ... to step ...`.

## Key design decisions and assumptions

- Regex mini-syntax, not NLP: predictable, testable command forms, no LLM used or required.
- Pure, tested logic lives in `lib/`; components only call it.
- The simulation trace is embedded in node order and `data.description`, not a parallel structure;
  `move node ... to step ...` re-lays out node x-positions to match, without rewiring edges.
- Node matching is case-insensitive substring; duplicate-label rejection is exact-match.
- The command log doubles as the validation UI - every command is appended with its outcome.
- Every canvas mouse action synthesizes and runs the same command text a user would type.
- Edges form a single linear path (one outgoing/incoming edge per node, no cycles); Import re-validates the same invariants against an untrusted file.
- Merge remaps a colliding incoming id/label rather than rejecting the file, reusing `add node`'s own disambiguation; From/To are namespaced `current:<id>`/`incoming:<id>` pre-remap, and Insert at step splices the incoming block into `current.nodes`, re-laying out positions after it.
- `undo`/`redo` are two stacks of `{ command, snapshot }` pairs pushed by every mutating command; a fresh command clears redo, and history clears on hydration, cross-tab sync, or "Clear history".
- Node reference lookup's substring fallback is indexed by a suffix trie over every label, so a lookup costs O(query length) rather than O(nodes); the autocomplete dropdown reuses it.

## What I'd improve with more time

- A cross-tab `storage` event can overwrite local state with a remote snapshot mid-autosave; a real fix needs synchronous persistence or version tracking - out of proportion for this app's size.
- The page paints the seed architecture first, then swaps in localStorage's saved state on mount -
  a visible flash. A synchronous read would remove it but risks hydration-mismatch warnings.
- A proper user story on how users could actually benefit from this visualization.
- More robust implementation of the merging feature.

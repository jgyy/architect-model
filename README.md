# architect-model

A small web app for updating a system architecture (nodes + edges) via text input, and exploring
a simulation trace through it. Visual editing on the canvas mirrors text editing exactly; every
mouse action runs the same command a typed instruction would.

## Who this is for

> As a security engineer reviewing a proposed system design, I want to sketch the architecture in
> plain text and then step through a simulated attacker's path across it, so I can see at a glance
> which components are reachable, in what order, and where the blast radius stops.

The seed data (`src/data/example-architecture.ts`) tells that story: "Attacker starts from
Internet → reaches Web Server → accesses Database". A node's position in `architecture.nodes` _is_
its simulation step - there is no separate step list to keep in sync with the architecture.

## Run locally

```bash
npm install
npm run dev
```

Open http://localhost:3000. `npm test` runs the unit tests; `npm run check` runs lint, typecheck,
format, and tests together.

## Supported commands

Typed into the console's command input, one at a time. Node references match case-insensitively
and by substring; an unrecognized command or a missing/ambiguous node reference is rejected inline
in the log, with the match(es) it found. A dropdown autocompletes node names as you type (not for
`add node`, since that label is new).

| Command                         | Aliases                                        | Example                           | Effect                                                                                                                                 |
| ------------------------------- | ---------------------------------------------- | --------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `add node <label>`              | `create node`, `new node`, `add a node called` | `add node Cache`                  | Adds a node as the next simulation step.                                                                                               |
| `connect <A> to <B>`            | `connect A and B`, `link A to/and B`           | `connect Web Server to Cache`     | Adds an edge; both nodes must exist, each node allows only one outgoing/incoming edge, and cycles (including self-loops) are rejected. |
| `remove node <label>`           | `delete node`                                  | `remove node Cache`               | Removes the node, its edges, and its step.                                                                                             |
| `remove edge <A> to <B>`        | `delete edge`, `disconnect A from/and B`       | `remove edge Web Server to Cache` | Removes the edge.                                                                                                                      |
| `rename node <A> to <B>`        | `relabel node A to B`                          | `rename node Cache to Redis`      | Renames the node everywhere it's referenced.                                                                                           |
| `move node <label> to step <n>` | `reorder node`                                 | `move node Cache to step 2`       | Reorders the node's simulation step.                                                                                                   |
| `export`                        | -                                              | `export`                          | Downloads the architecture as `architecture.json` (React Flow-compatible `{ nodes, edges }`).                                          |
| `undo`                          | -                                              | `undo`                            | Reverts the last command.                                                                                                              |
| `redo`                          | -                                              | `redo`                            | Re-applies the last undone command.                                                                                                    |

Undo/redo also have toolbar buttons (next to "Clear console"), disabled when there's nothing to
undo/redo. They cover every command-driven change - typed or from a canvas gesture, since those
synthesize the same commands - but not raw node-position dragging, which never runs through the
command log. The history is per-tab and not persisted: it resets on reload and is cleared by
"Clear history" or a state update arriving from another tab.

Nodes are also draggable on the canvas (positions persist), double-click to rename, drag from a
node's edge to connect another, and a hover-revealed × deletes - each mirrors the command above in
the log. A "?" button in the canvas corner explains the mouse gestures. The toolbar's **Import**
button (no typed equivalent - it needs a file) replaces the architecture with a chosen JSON file;
a rejected file (bad JSON, a duplicate id, a dangling edge, more than one edge in/out of a node, or
a cycle) is left untouched and logged, while a successful import is undoable like any command.

## History, simulation & multi-tab sync

The command log, architecture, current step, and playback speed all persist to `localStorage` and
restore on reload (always paused). **Clear history** resets everything to the seeded example. Open
a second tab and the same state stays live between them via the browser's native `storage` event.

The Simulation panel steps through `architecture.nodes` in order: **Prev**/**Next** navigate
manually; **Play**/**Pause** auto-advance at an adjustable 0.5x–4x speed, stopping at the last
step. On the canvas, the current step's node is ringed in accent; every node/edge already crossed
is colored red. Steps can also be dragged to a new position in the panel's list, or reordered with
each row's up/down buttons; both run the same `move node ... to step ...` command shown above.

## Key design decisions and assumptions

- Regex mini-syntax, not NLP: predictable, testable command forms, no LLM used or required.
- Pure, tested logic lives in `lib/`; components only call it.
- The simulation trace is embedded in node order and `data.description`, not a parallel structure.
- Node matching is case-insensitive substring; duplicate-label rejection is exact-match.
- The command log doubles as the validation UI - every command is appended with its outcome.
- Persistence takes a storage interface, not `window.localStorage` directly, so it's unit-tested.
- Every canvas mouse action synthesizes and runs the same command text a user would type.
- Auto-play schedules one `setTimeout` per tick, not `setInterval`, so it can't drift.
- The canvas re-fits via `fitView()` on node-id changes, debounced so a burst of edits settles once.
- The autocomplete's command patterns live in `lib/node-reference.ts`, shared with the parser.
- `onNodesChange` only applies `"position"` changes; `deleteKeyCode={null}` keeps removal text-only.
- Multi-tab sync relies on `storage` events firing only in _other_ tabs; `interpretStorageEvent` classifies each event, and a ref tracking the last-written JSON stops tabs from re-triggering each other's writes.
- Edges are constrained to a single linear path: at most one outgoing and one incoming edge per
  node, and a `connect` that would close a cycle (including a self-loop) is rejected - the cycle
  check is a single forward walk since fan-out is already capped at one. Import re-validates the
  same invariants against an untrusted file, reusing that walk-from-every-root idea to find cycles.
- `move node ... to step ...` re-lays out every node's x position to match its new step order, so reordering a step visually repositions it on the canvas too; edges aren't rewired.
- `undo`/`redo` are two stacks of `{ command, snapshot }` pairs (`lib/undo-history.ts`), pushed to
  by every successful architecture-mutating command, including import; a fresh command clears the
  redo branch. The history is ephemeral rather than persisted, and is cleared on hydration, a
  cross-tab sync, or "Clear history" so it never restores a snapshot the current architecture
  didn't actually come from.

## What I'd improve with more time

- Node matching's substring fallback is still an O(nodes) scan when a reference isn't exact; a
  trigram or prefix index would help, but wasn't worth the complexity at this app's scale.
- Import replaces the whole architecture - no merging into the existing one, or importing a subset.

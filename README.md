# architect-model

A small web app for updating a system architecture (nodes + edges) via text
input, and exploring a simulation trace through it. Visual editing on the
canvas mirrors text editing exactly; every mouse action runs the same
command a typed instruction would.

## Who this is for

> As a security engineer reviewing a proposed system design, I want to
> sketch the architecture in plain text and then step through a simulated
> attacker's path across it, so I can see at a glance which components are
> reachable, in what order, and where the blast radius stops.

The seed data (`src/data/example-architecture.ts`) tells that story:
"Attacker starts from Internet → reaches Web Server → accesses Database". A
node's position in `architecture.nodes` _is_ its simulation step - there is
no separate step list to keep in sync with the architecture.

## Run locally

```bash
npm install
npm run dev
```

Open http://localhost:3000. `npm test` runs the unit tests; `npm run check`
runs lint, typecheck, format, and tests together.

## Supported commands

Typed into the console's command input, one at a time. Node references
match case-insensitively and by substring; an unrecognized command or a
missing/ambiguous node reference is rejected inline in the log, with the
match(es) it found. A dropdown autocompletes node names as you type (not
for `add node`, since that label is new).

| Command                         | Aliases                                        | Example                           | Effect                                                                                                                                 |
| ------------------------------- | ---------------------------------------------- | --------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `add node <label>`              | `create node`, `new node`, `add a node called` | `add node Cache`                  | Adds a node as the next simulation step.                                                                                               |
| `connect <A> to <B>`            | `connect A and B`, `link A to/and B`           | `connect Web Server to Cache`     | Adds an edge; both nodes must exist, each node allows only one outgoing/incoming edge, and cycles (including self-loops) are rejected. |
| `remove node <label>`           | `delete node`                                  | `remove node Cache`               | Removes the node, its edges, and its step.                                                                                             |
| `remove edge <A> to <B>`        | `delete edge`, `disconnect A from/and B`       | `remove edge Web Server to Cache` | Removes the edge.                                                                                                                      |
| `rename node <A> to <B>`        | `relabel node A to B`                          | `rename node Cache to Redis`      | Renames the node everywhere it's referenced.                                                                                           |
| `move node <label> to step <n>` | `reorder node`                                 | `move node Cache to step 2`       | Reorders the node's simulation step.                                                                                                   |

Nodes are also draggable on the canvas (positions persist), double-click to
rename, drag from a node's edge to connect another, and a hover-revealed ×
deletes - each mirrors the command above in the log. Delete/Backspace on
the canvas is disabled, so removal is always logged and always cleans up
edges. A "?" button in the canvas corner explains the mouse gestures.

## History, simulation & multi-tab sync

The command log, architecture, current step, and playback speed all persist
to `localStorage` and restore on reload (always paused). **Clear history**
resets everything to the seeded example. Open a second tab and the same
state stays live between them via the browser's native `storage` event - no
reload needed (only play/pause stays per-tab).

The Simulation panel steps through `architecture.nodes` in order:
**Prev**/**Next** navigate manually; **Play**/**Pause** auto-advance at an
adjustable 0.5x–4x speed, stopping at the last step. It degrades gracefully
if the current step's node was removed. On the canvas, the current step's
node is ringed in accent; every node/edge already crossed is colored red,
so the traversed path reads as a route, not a single blinking dot. Steps
can also be dragged to a new position in the panel's list, or reordered with
each row's up/down buttons (keyboard-operable, disabled at the ends); both
run the same `move node ... to step ...` command shown above.

## Key design decisions and assumptions

- Regex mini-syntax, not NLP: predictable, testable command forms, no LLM used or required.
- Pure, tested logic lives in `lib/`; components only call it.
- The simulation trace is embedded in node order and `data.description`, not a parallel structure - adding, removing, or reordering a node does the same to its step.
- Node matching is case-insensitive substring; duplicate-label rejection is exact-match.
- The command log doubles as the validation UI - every command is appended with its outcome.
- Persistence takes a storage interface, not `window.localStorage` directly, so it's unit-tested with a fake store.
- Every canvas mouse action (drag-connect, rename, delete, create) synthesizes and runs the same command text a user would type, so the log always explains what happened; dragging a Simulation step to reorder it does the same.
- Auto-play schedules one `setTimeout` per tick, not `setInterval`, so it can't drift and auto-stops at the last step.
- The canvas re-fits via `fitView()` on node-id changes, debounced so a burst of edits settles once instead of re-animating per change.
- The autocomplete's command patterns live in `lib/node-reference.ts`, shared with the parser, so the two never diverge.
- `onNodesChange` only applies `"position"` changes; `deleteKeyCode={null}` backs it up, keeping removal text-only.
- Multi-tab sync relies on `storage` events firing only in _other_ tabs; `interpretStorageEvent` (pure, tested) classifies each event, and a ref tracking the last-written JSON stops tabs from re-triggering each other's writes once they converge.
- Edges are constrained to a single linear path: each node allows at most one outgoing and one incoming edge, and a `connect` that would close a cycle (including a self-loop) is rejected - this keeps the simulation trace a straight walk instead of a general graph, and the cycle check itself is a single forward walk (no branching search) since fan-out is already capped at one.
- `move node ... to step ...` re-lays out every node's x position to match its new step order (y is left untouched), so reordering a step visually repositions it on the canvas instead of only reordering the sidebar list; edges aren't rewired, since they follow whatever positions their endpoints currently have.

## What I'd improve with more time

- Node matching's substring fallback (`findNodeOrAmbiguity`) is still an O(nodes) scan when a reference isn't an exact label match; a trigram or prefix index would make it faster, but wasn't worth the added complexity at this app's scale.

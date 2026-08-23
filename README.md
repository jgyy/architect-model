# architect-model

A small web app for updating a system architecture (nodes + edges) via text input, and exploring
a simulation trace through it. Visual editing on the canvas mirrors text editing exactly - every
mouse action runs the same command a typed instruction would.

## Who this is for

As a security engineer reviewing a proposed system design, I want to sketch the architecture in
plain text and step through a simulated attacker's path across it, so I can see which components
are reachable, in what order, and where the blast radius stops. The seed data
(`src/data/example-architecture.ts`) tells that story: "Internet → Web Server → Database". A
node's position in `architecture.nodes` _is_ its simulation step - no separate step list to sync.

## Run locally

```bash
npm install
npm run dev
```

Open http://localhost:3000. `npm test` runs the unit tests; `npm run check` runs lint, typecheck,
format, and tests together.

## Supported commands

Typed into the console's command input, one at a time. Node references match case-insensitively
and by substring; an unrecognized command or a missing/ambiguous reference is rejected inline in
the log. A dropdown autocompletes node names as you type (not for `add node`, since it's new).

| Command                         | Aliases                                  | Example                           | Effect                                                        |
| ------------------------------- | ---------------------------------------- | --------------------------------- | ------------------------------------------------------------- |
| `add node <label>`              | `create node`, `new node`                | `add node Cache`                  | Adds a node as the next simulation step.                      |
| `connect <A> to <B>`            | `connect A and B`, `link A to/and B`     | `connect Web Server to Cache`     | Adds an edge; one outgoing/incoming edge per node, no cycles. |
| `remove node <label>`           | `delete node`                            | `remove node Cache`               | Removes the node, its edges, and its step.                    |
| `remove edge <A> to <B>`        | `delete edge`, `disconnect A from/and B` | `remove edge Web Server to Cache` | Removes the edge.                                             |
| `rename node <A> to <B>`        | `relabel node A to B`                    | `rename node Cache to Redis`      | Renames the node everywhere it's referenced.                  |
| `move node <label> to step <n>` | `reorder node`                           | `move node Cache to step 2`       | Reorders the node's simulation step.                          |
| `export`                        | -                                        | `export`                          | Downloads the architecture as `architecture.json`.            |
| `undo` / `redo`                 | -                                        | `undo`                            | Reverts / re-applies the last command.                        |

Undo/redo also have toolbar buttons, disabled when there's nothing to undo/redo; they cover every
command-driven change (typed or canvas-driven) but not raw node-position dragging. History is
per-tab, not persisted, and clears on "Clear history" or a cross-tab sync.

Nodes are also draggable (positions persist), double-click to rename, drag from an edge handle to
connect, and a hover-revealed × deletes - each mirrors the command above. A "?" button explains the
mouse gestures. **Import** replaces the whole architecture with a chosen JSON file, rejecting
anything malformed or invariant-violating and leaving the current architecture untouched. **Merge**
instead opens a picker to choose which of the file's nodes (and, independently, which of its
edges) to bring in (all checked by default, with a live node/edge count and a "will be renamed"
hint on any label collision), plus a **Connect** control to add a connection of your own between
two selected nodes the file left unconnected, before adding them alongside the existing
architecture: a colliding incoming id or label is renamed (`"Cache (2)"`) so every node stays
addressable, and the log notes any renames.

## History, simulation & multi-tab sync

The command log, architecture, current step, and playback speed persist to `localStorage` and
restore on reload (always paused). **Clear history** resets to the seeded example. Two tabs stay
in sync via the browser's native `storage` event.

The Simulation panel steps through `architecture.nodes` in order: **Prev**/**Next** navigate
manually; **Play**/**Pause** auto-advance at 0.5x-4x speed. The current step's node is ringed in
accent; crossed nodes/edges turn red. Steps can be dragged or reordered with up/down buttons, both
running `move node ... to step ...`.

## Key design decisions and assumptions

- Regex mini-syntax, not NLP: predictable, testable command forms, no LLM used or required.
- Pure, tested logic lives in `lib/`; components only call it.
- The simulation trace is embedded in node order and `data.description`, not a parallel structure.
- Node matching is case-insensitive substring; duplicate-label rejection is exact-match.
- The command log doubles as the validation UI - every command is appended with its outcome.
- Every canvas mouse action synthesizes and runs the same command text a user would type.
- Edges form a single linear path (at most one outgoing/incoming edge per node, no cycles); Import
  re-validates the same invariants against an untrusted file.
- Merge remaps a colliding incoming id/label rather than rejecting the file, reusing `add node`'s
  own disambiguation - since the two node sets never share an id, the merged graph can't violate
  the invariants above.
- The merge picker's edge checkboxes default to "included" when both endpoints are selected, but
  unchecking one drops just that edge while keeping both nodes - a choice that sticks even if a
  node is toggled off and back on. Its Connect control fills the other direction - manually adding
  an edge the file didn't have - by reusing the same single-outgoing/single-incoming/no-cycle
  invariant as the main `connect` command, so the two feel like one consistent capability.
- `move node ... to step ...` re-lays out node x-positions to match the new step order; edges
  aren't rewired.
- `undo`/`redo` are two stacks of `{ command, snapshot }` pairs, pushed to by every mutating
  command including import/merge; a fresh command clears the redo branch, and the whole history
  clears on hydration, a cross-tab sync, or "Clear history".
- Node reference lookup's substring fallback is indexed by a suffix trie over every label
  (`NodeIndex`), so a lookup costs O(query length) rather than O(nodes); the live-typing
  autocomplete dropdown queries that same trie for the same reason.

## What I'd improve with more time

- The merge picker's Connect control only links two of the incoming file's own nodes together; it
  can't connect a merged node to one already in the existing architecture - that still needs a
  follow-up `connect` after confirming the merge.

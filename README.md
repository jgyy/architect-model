# architect-model

A small web app for updating a system architecture (nodes + edges) via text
input and exploring a simulation trace through it.

## Who this is for

> As a security engineer reviewing a proposed system design, I want to
> sketch the architecture in plain text and then step through a simulated
> attacker's path across it, so I can see at a glance which components are
> reachable, in what order, and where the blast radius stops — without
> hand-drawing a diagram.

The seed data (`src/data/example-simulation.ts`) tells that story already —
"Attacker starts from Internet → reaches Web Server → accesses Database" —
and the UI is built to serve it:

- The command box (with autocomplete and inline validation) keeps editing
  the architecture low-friction as the model grows.
- Stepping through the simulation doesn't just mark where the attacker is
  now — it colors in the whole route already crossed (nodes and edges, in
  `--danger` red) against the current node (`--accent`), so the blast
  radius is visible at a glance, not just one dot at a time.
- A failed command explains why, in place, so you can trust the model
  reflects what you typed.

## Run locally

```bash
npm install
npm run dev
```

Open http://localhost:3000. `npm test` runs the unit tests.

## Supported commands

Typed into the "Command" box, one at a time. Node references match
case-insensitively and by substring; unrecognized input or a reference to a
missing node is rejected inline in the log. A dropdown autocompletes node
names as you type (not for `add node`, since that label is new).

| Command                           | Aliases                                        | Example                           | Effect                                                                        |
| --------------------------------- | ---------------------------------------------- | --------------------------------- | ----------------------------------------------------------------------------- |
| `add node <label>`                | `create node`, `new node`, `add a node called` | `add node Cache`                  | Adds a node; rejects a blank or duplicate label.                              |
| `connect <A> to <B>`              | `connect <A> and <B>`, `link <A> to/and <B>`   | `connect Web Server to Cache`     | Adds an edge; both nodes must exist.                                          |
| `remove node <label>`             | `delete node`                                  | `remove node Cache`               | Removes the node and its edges.                                               |
| `remove edge <A> to <B>`          | `delete edge`, `disconnect <A> from/and <B>`   | `remove edge Web Server to Cache` | Removes the edge.                                                             |
| `add step <label>`                | —                                              | `add step Cache`                  | Appends a simulation step at that node.                                       |
| `insert step <n> <label>`         | —                                              | `insert step 2 Cache`             | Inserts a step at position `n`, shifting later steps down.                    |
| `set step <n> description <text>` | —                                              | `set step 2 description ...`      | Replaces step `n`'s description.                                              |
| `remove step <n>`                 | —                                              | `remove step 2`                   | Removes step `n`; remaining steps renumber.                                   |
| `move step <a> to <b>`            | —                                              | `move step 3 to 1`                | Relocates the step at position `a` to position `b`; remaining steps renumber. |

Nodes are draggable and their positions persist. Removal is text-only —
Delete/Backspace on the canvas is disabled — so it's always logged and
always cleans up edges.

## History, simulation & multi-tab sync

The command log, architecture, trace, step, and speed all persist to
`localStorage` and restore on reload (always paused). **Clear history**
resets everything to the seeded example. Open a second tab and this same
state stays live between them via the browser's native `storage` event — a
command, drag, or **Clear history** in one tab appears in every other tab
instantly, no reload needed (only the play/pause toggle stays per-tab).

The "Simulation" panel steps through the trace (seeded from
`src/data/example-simulation.ts`, editable via the step commands above):
**Prev**/**Next** navigate manually; **Play**/**Pause** auto-advances at an
adjustable 0.5x–4x speed, stopping at the last step. It degrades gracefully
if a step's node was removed or the step itself is removed. On the canvas,
the current step's node is ringed in the accent color; every node and edge
already crossed to get there is colored red, so the traversed path reads as
a route, not a single blinking dot.

## Key design decisions and assumptions

- Regex mini-syntax, not NLP: predictable, testable command forms, no LLM used or required.
- Pure, tested logic lives in `lib/`; the UI just calls it.
- Node matching is case-insensitive substring; duplicate-label rejection is exact-match.
- The command log doubles as the validation UI — every command is appended with its outcome.
- The trace is editable but decoupled from the architecture; `CommandResult` always carries both.
- The current step index is re-derived every render, since `remove step` can shrink the trace mid-render.
- Persistence takes a storage interface, not `window.localStorage` directly, so it's unit-tested with a fake store.
- The canvas re-fits via `fitView()` imperatively on node-id changes, since the `fitView` prop only runs once.
- Auto-play schedules one `setTimeout` per tick, not `setInterval`, so it can't drift and auto-stops at the last step.
- `getTraversedPath` derives visited nodes/edges from the trace up to the current step; a step pair with no matching edge just contributes no edge, same graceful-degradation approach as the rest of the simulation code.
- Speed index is lifted into `ArchitectureWorkspace`; `isPlaying` stays local/unpersisted so a reload never auto-resumes playback.
- The autocomplete's command patterns live in `lib/node-reference.ts`, shared with the parser, so the two never diverge.
- `onNodesChange` only applies `"position"` changes; `deleteKeyCode={null}` backs it up, keeping removal text-only.
- Multi-tab sync relies on `storage` events firing only in _other_ tabs; `interpretStorageEvent` (pure, tested) classifies each event, and a ref tracking the last-written JSON stops tabs from re-triggering each other's writes once they converge.
- `insert step`/`move step` both splice the trace array and renumber through the same `renumberSteps` helper `remove step` uses, so `step` always mirrors array position.

## What I'd improve with more time

- Drag-to-reorder steps directly in the Simulation panel, to complement the `insert step`/`move step` text commands.

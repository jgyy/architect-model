# architect-model

A small web app for updating a system architecture (nodes + edges) via text
input and exploring a simulation trace through it.

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

| Command | Aliases | Example | Effect |
| --- | --- | --- | --- |
| `add node <label>` | `create node`, `new node`, `add a node called` | `add node Cache` | Adds a node; rejects a blank or duplicate label. |
| `connect <A> to <B>` | `connect <A> and <B>`, `link <A> to/and <B>` | `connect Web Server to Cache` | Adds an edge; both nodes must exist. |
| `remove node <label>` | `delete node` | `remove node Cache` | Removes the node and its edges. |
| `remove edge <A> to <B>` | `delete edge`, `disconnect <A> from/and <B>` | `remove edge Web Server to Cache` | Removes the edge. |
| `add step <label>` | — | `add step Cache` | Appends a simulation step at that node. |
| `set step <n> description <text>` | — | `set step 2 description ...` | Replaces step `n`'s description. |
| `remove step <n>` | — | `remove step 2` | Removes step `n`; remaining steps renumber. |

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
if a step's node was removed or the step itself is removed.

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
- Speed index is lifted into `ArchitectureWorkspace`; `isPlaying` stays local/unpersisted so a reload never auto-resumes playback.
- The autocomplete's command patterns live in `lib/node-reference.ts`, shared with the parser, so the two never diverge.
- `onNodesChange` only applies `"position"` changes; `deleteKeyCode={null}` backs it up, keeping removal text-only.
- Multi-tab sync relies on `storage` events firing only in *other* tabs; `interpretStorageEvent` (pure, tested) classifies each event, and a ref tracking the last-written JSON stops tabs from re-triggering each other's writes once they converge.

## What I'd improve with more time

- Insert/reorder steps mid-trace.

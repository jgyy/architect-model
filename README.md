# architect-model

A small web app for updating a system architecture (nodes + edges) via text
input and exploring a simulation trace through it.

## Status

**Step 10 (current):** full brief + Step 7-9 bonus items (aliases, persisted
history, validation, canvas auto-fit, editable trace, auto-play, node-ref
autocomplete), plus an adjustable auto-play speed for the simulation.

## Run locally

```bash
npm install
npm run dev
```

Open http://localhost:3000. `npm test` runs the unit tests (command parser,
simulation helpers, persistence).

## Supported commands

Typed into the "Command" box in the sidebar, one at a time:

| Command | Aliases | Example | Effect |
| --- | --- | --- | --- |
| `add node <label>` | `create node`, `new node`, `add a node called` | `add node Cache` | Adds a node. Rejects a blank or already-used label. |
| `connect <A> to <B>` | `connect <A> and <B>`, `link <A> to/and <B>` | `connect Web Server to Cache` | Adds an edge; both nodes must exist. |
| `remove node <label>` | `delete node` | `remove node Cache` | Removes the node and its edges. |
| `remove edge <A> to <B>` | `delete edge`, `disconnect <A> from/and <B>` | `remove edge Web Server to Cache` | Removes the edge. |
| `add step <label>` | — | `add step Cache` | Appends a simulation step at that node; node must already exist. |
| `set step <n> description <text>` | — | `set step 2 description Attacker pivots to Cache` | Replaces step `n`'s description (1-indexed). |
| `remove step <n>` | — | `remove step 2` | Removes step `n`; remaining steps renumber from 1. |

Node references match case-insensitively and by substring; anything
unrecognized, or referencing a missing node, is rejected inline in the log.

While typing a node argument (for `connect`, `remove node`, `remove edge`,
or `add step`), a dropdown suggests matching existing node labels, ranked
exact → starts-with → contains. Click, or Arrow keys + Enter, to insert the
exact label and keep typing; Escape dismisses it. `add node` never
suggests, since that label is new rather than a reference.

## Chat history & simulation exploration

The command log, architecture, and simulation trace save to `localStorage`
after every change and restore on reload (**Clear history** resets to the
seeded example). The "Simulation" panel steps through a trace (seeded from
`src/data/example-simulation.ts`, editable via the step commands above):

- **Prev**/**Next** step through the trace; **Play**/**Pause** auto-advances,
  stopping at the last step. The speed selector (0.5x-4x, default 1x =
  1.5s/step) sets the tick interval and applies immediately, even mid-play.
- Degrades gracefully: shows "(node no longer in architecture)" if a step's
  node was removed, and re-clamps if you remove the step you're viewing.

## Key design decisions and assumptions

- **Regex mini-syntax, not NLP.** Predictable, testable command forms; no
  LLM used or required, per the brief.
- **Pure, tested logic in `lib/`; the UI just calls it**, including the new
  `lib/node-suggestions.ts` autocomplete matcher.
- **Node matching is case-insensitive substring** (exact preferred, forgiving
  of typos); **duplicate-label rejection is exact-match**, so `add node Web`
  isn't blocked just because "Web Server" already exists.
- **The command log is the validation UI**: every command is appended with
  its outcome; `connect` also rejects self-loops/duplicates.
- **The trace is editable but decoupled from the architecture** —
  `CommandResult` always carries both, so call sites never branch on which
  kind of command ran.
- **The current step index is re-derived every render**, not fixed up in a
  `useEffect` — a `remove step` can shrink the trace mid-render.
- **Persistence takes a storage interface**, not `window.localStorage`
  directly, so it's unit-tested with a fake in-memory store.
- **The canvas re-fits via `fitView()` imperatively** on node-id changes,
  since the `fitView` prop only runs once, on mount.
- **Auto-play schedules one `setTimeout` per tick, not `setInterval`**, so
  it can't drift and auto-stops at the last step; a plain index into a
  static speed list (kept local to `SimulationPanel`, not `lib/`, since
  there's no branching logic worth testing) sets the interval, so changing
  it mid-play just reschedules the pending tick for free.
- **The autocomplete's command patterns live in `lib/node-reference.ts`**,
  shared with the parser, so the two can never recognize different
  command shapes as they evolve.
- **Suggestion matching splits `"<A> <sep> <B>"` at the last separator**
  while typing — cheaper than the parser's exhaustive search, and matches
  how someone types left-to-right.
- **The autocomplete tracks cursor position, not just the input value.**
  For `connect`/`remove edge`, which argument gets suggestions (and what
  span gets replaced) is chosen by comparing the caret offset to the
  separator, so fixing `A` after `B` is typed suggests only for `A`.

## What I'd improve with more time

- Persist the simulation's current step (and chosen playback speed)
  alongside the architecture and log, so a reload resumes exactly where
  you left off instead of resetting to step 1 / 1x.
- Sync persisted state across open tabs; insert/reorder steps mid-trace.

# architect-model

A small web app for updating a system architecture (nodes + edges) via text
input and exploring a simulation trace through it.

## Status

**Step 7 (current):** Full brief implemented — visual architecture (React
Flow), text-command editing, simulation stepping, plus the Bonus items:
command aliases, persisted chat history, extra validation, canvas
auto-fit/pan, an editable simulation trace, and simulation auto-play.

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

Node references match case-insensitively and by substring. Anything
unrecognized, or referencing a missing node, is rejected with an inline
error in the command log rather than doing nothing silently.

## Chat history & simulation exploration

The command log, architecture, and simulation trace save to `localStorage`
after every change and restore on reload (**Clear history** resets to the
seeded example). The "Simulation" panel steps through a trace (seeded from
`src/data/example-simulation.ts`, editable via the `add step`/`set step
... description`/`remove step` commands above):

- **Prev**/**Next** move through the trace, disabling at the first/last step.
- **Play**/**Pause** auto-advances one step every 1.5s, stopping at the last
  step instead of looping; disabled when there's nothing left to play.
- Degrades gracefully: shows "(node no longer in architecture)" if a step's
  node was removed, and re-clamps if you remove the step you're viewing.

## Key design decisions and assumptions

- **Regex mini-syntax, not NLP.** Predictable, testable command forms; no
  LLM used or required, per the brief.
- **Pure, tested logic in `lib/`; the UI just calls it.** Command parser,
  simulation helpers, and persistence are all pure, DOM-free, immutable.
- **Node matching is case-insensitive substring** (exact preferred) —
  forgiving of typos, at the cost of possible ambiguity.
- **Duplicate-label rejection is exact-match**, so `add node Web` isn't
  blocked just because "Web Server" already exists.
- **The command log is the validation UI**: every command is appended with
  its outcome; `connect` also rejects self-loops/duplicates.
- **The trace is editable but decoupled from the architecture** —
  `CommandResult` always carries both (possibly unchanged) `architecture`
  and `trace`, so call sites never branch on which kind of command ran.
- **The current step index is re-derived every render**
  (`clampStepIndex`), not fixed up in a `useEffect` — a `remove step` can
  shrink the trace in the same render pass that reads it.
- **Persistence takes a storage interface**, not `window.localStorage`
  directly, so it's unit-tested with a fake in-memory store.
- **The canvas re-fits via `fitView()` imperatively** — a child component
  watches the node-id list and re-calls it on change, since the `fitView`
  prop only runs once, on mount.
- **Auto-play schedules one `setTimeout` per tick, not `setInterval`**,
  re-deriving the next index each tick via the pure, tested
  `getNextPlayIndex` so it can't drift and auto-stops at the last step.
  `onStepChange` is `useCallback`'d so unrelated re-renders (e.g. command
  keystrokes) don't reset the timer.

## What I'd improve with more time

- A richer node-reference picker instead of typed labels.
- An adjustable playback speed for auto-play, instead of a fixed 1.5s tick.
- Persist the simulation's current step alongside the architecture and log.
- Sync persisted state across open tabs; insert/reorder steps mid-trace.

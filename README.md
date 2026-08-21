# architect-model

A small web app for updating a system architecture (nodes + edges) via text
input and exploring a simulation trace through it.

## Status

**Step 6 (current):** Full brief implemented — visual architecture (React
Flow), text-command editing, simulation stepping, plus the Bonus items:
command aliases, persisted chat history, and extra validation — plus the
canvas auto-fits/pans after node-set edits, and the simulation trace itself
is now editable via text commands instead of being static seed data.

## Run locally

```bash
npm install
npm run dev
```

Then open http://localhost:3000.

## Run tests

```bash
npm test
```

Covers the command parser (`architecture-commands.ts`), simulation helpers
(`simulation.ts`), and session persistence (`persistence.ts`).

## Supported commands

Typed into the "Command" box in the sidebar, one at a time:

| Command | Aliases | Example | Effect |
| --- | --- | --- | --- |
| `add node <label>` | `create node`, `new node`, `add a node called` | `add node Cache` | Adds a node. Rejects a blank or already-used label. |
| `connect <A> to <B>` | `connect <A> and <B>`, `link <A> to/and <B>` | `connect Web Server to Cache` | Adds an edge; both nodes must exist. |
| `remove node <label>` | `delete node` | `remove node Cache` | Removes the node and its edges. |
| `remove edge <A> to <B>` | `delete edge`, `disconnect <A> from/and <B>` | `remove edge Web Server to Cache` | Removes the edge. |
| `add step <label>` | — | `add step Cache` | Appends a simulation step at that node; node must already exist. Description auto-fills to `Reaches "Cache".`. |
| `set step <n> description <text>` | — | `set step 2 description Attacker pivots to Cache` | Replaces step `n`'s description (1-indexed). |
| `remove step <n>` | — | `remove step 2` | Removes step `n`; remaining steps renumber from 1. |

Node references match case-insensitively and by substring. Anything
unrecognized, or referencing a missing node, is rejected with an inline
error in the command log rather than doing nothing silently.

## Chat history

The command log, architecture, and simulation trace save to `localStorage`
after every change and restore automatically on reload. Click **Clear
history** to reset back to the seeded example and its seeded trace.

## Simulation exploration

The "Simulation" panel steps through a trace (seeded from
`src/data/example-simulation.ts`, editable via the `add step`/`set step ...
description`/`remove step` commands above):

- Shows the step's description and highlights its node on the canvas.
- **Prev**/**Next** move through the trace, disabling at the first/last step.
- Degrades gracefully instead of crashing: shows "(node no longer in
  architecture)" if a step's node was removed, and re-clamps to the nearest
  valid step if you remove the step you're currently viewing.

## Key design decisions and assumptions

- **Regex mini-syntax, not NLP.** Predictable, testable command forms; no
  LLM used or required, per the brief.
- **Pure, tested logic in `lib/`; the UI just calls it.** Command parser,
  simulation helpers, and persistence are all pure, DOM-free, immutable.
- **Node matching is case-insensitive substring** (exact preferred), not
  fuzzy search — forgiving of typos, at the cost of possible ambiguity.
- **Duplicate-label rejection is exact-match**, so `add node Web` isn't
  blocked just because "Web Server" already exists.
- **The command log is the validation UI** (bonus item): every command is
  appended with its outcome; `connect` also rejects self-loops/duplicates.
- **The trace is editable but decoupled from the architecture** — `add step`/`remove step`/`set step ...
  description` mutate it directly, and `CommandResult` always carries both (possibly unchanged)
  `architecture` and `trace` so call sites never branch on which kind of command ran.
- **The current step index is re-derived every render** (`clampStepIndex(currentStepIndex,
  trace.length)`), not fixed up in a `useEffect` — a `remove step` can shrink the trace in the same
  render pass that reads it, and an effect-based fixup runs one render too late for an array index
  (unlike `fitView()`, which is safe to run a tick late since it's a camera move, not a render read).
- **Persistence takes a storage interface**, not `window.localStorage` directly, so it's unit-tested
  with a fake in-memory store. Hydration starts at SSR defaults, then a mount-only effect loads the
  persisted session — a one-render flash instead of a hydration error.
- **The canvas re-fits via `fitView()` imperatively**, not just the prop (which only runs once, on
  mount): a child component watches the node-id list and re-calls it, so edits never leave a node
  outside the viewport.

## What I'd improve with more time

- A richer node-reference picker instead of typed labels.
- Auto-advance ("play") through the simulation on a timer.
- Persist the simulation's current step alongside the architecture and log.
- Sync persisted state across open tabs via the `storage` event; insert/reorder steps mid-trace.

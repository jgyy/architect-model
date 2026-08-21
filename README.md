# architect-model

A small web app for updating a system architecture (nodes + edges) via text
input and exploring a simulation trace through it.

## Status

**Step 4 (current):** Full brief implemented — visual architecture (React
Flow), text-command editing, simulation stepping, plus the Bonus items:
command aliases, persisted chat history, and extra validation.

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

Node references match case-insensitively and by substring. Anything
unrecognized, or referencing a missing node, is rejected with an inline
error in the command log rather than doing nothing silently.

## Chat history

The command log and current architecture save to `localStorage` after every
change and restore automatically on reload. Click **Clear history** to reset
back to the seeded Internet → Web Server → Database example.

## Simulation exploration

The "Simulation" panel steps through a fixed example trace (seeded in
`src/data/example-simulation.ts`), independent of the command log:

- Shows the step's description and highlights its node on the canvas.
- **Prev**/**Next** move through the trace, disabling at the first/last step.
- If a step's node was removed via a command, it shows "(node no longer in
  architecture)" instead of crashing.

## Key design decisions and assumptions

- **Regex mini-syntax, not NLP.** Predictable, testable command forms; no
  LLM is used or required, per the brief.
- **Pure, tested logic in `lib/`; the UI just calls it.** The command parser,
  simulation helpers, and persistence functions are all pure, with no
  React/DOM dependency — architecture updates are immutable.
- **Node matching is case-insensitive substring matching** (exact match
  preferred), not fuzzy search — forgiving of typos, at the cost of possible
  ambiguity between overlapping labels (not a concern here).
- **Duplicate-label rejection is exact-match**, via a separate helper, so
  `add node Web` isn't blocked just because "Web Server" already exists.
- **The command log is the validation UI** (bonus item): every command is
  appended with its outcome. `connect` also rejects self-loops and
  duplicate edges.
- **The simulation trace is static example data**, independent of the
  architecture; removing a step's node degrades gracefully instead of
  trying to repair the trace.
- **Persistence takes a storage interface, not `window.localStorage`
  directly**, so it's unit-tested in Node with a fake in-memory store.
  Hydration follows Next's guidance for client-only state: state starts at
  the SSR defaults, then a mount-only effect loads the persisted session —
  a one-render flash instead of a hydration error.

## What I'd improve with more time

- Auto-fit/pan the view after an edit adds a node outside the viewport.
- A richer node-reference picker instead of typed labels.
- Author/edit the simulation trace itself via text commands.
- Auto-advance ("play") through the simulation on a timer.
- Persist the simulation's current step alongside the architecture and log.
- Sync persisted state across open tabs via the `storage` event.

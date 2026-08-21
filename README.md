# architect-model

A small web app for updating a system architecture (nodes + edges) via text
input and exploring a simulation trace through it. See
[`docs/programming-assignment.md`](docs/programming-assignment.md) for the
full brief.

## Status

**Step 2 (current):** Text-based architecture updates. The architecture is
still rendered visually via [React Flow](https://reactflow.dev), seeded with
the example Internet → Web Server → Database architecture, and can now be
edited by typing commands into the sidebar. Simulation exploration is not
implemented yet.

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

Covers `src/lib/architecture-commands.ts`, the text-command parser — the
piece of business logic behind every architecture edit.

## Supported commands

Typed into the "Command" box in the sidebar, one at a time:

| Command | Example | Effect |
| --- | --- | --- |
| `add node <label>` | `add node Cache` | Adds a new node with that label. |
| `connect <A> to <B>` | `connect Web Server to Cache` | Adds an edge from node A to node B. Both must already exist. |
| `remove node <label>` | `remove node Cache` | Removes the node and any edges touching it. |
| `remove edge <A> to <B>` | `remove edge Web Server to Cache` | Removes the edge between A and B. |

Node references (`<A>`, `<B>`, `<label>` on removal) match **case-insensitively
and by substring** — `connect web to cache` matches "Web Server" and "Cache".
Anything that doesn't match one of the four forms above, or references a node
that doesn't exist, is rejected with an inline error message in the command
log rather than silently doing nothing or crashing.

## Key design decisions and assumptions

- **A structured mini-syntax, not free-text/NLP parsing.** The assignment
  explicitly leaves "how flexible the input interpretation is" up to the
  implementer. A small, predictable set of command forms keeps behavior easy
  to reason about, test, and document, at the cost of not understanding
  arbitrary phrasing (no LLM is used or required, per the brief).
- **The command parser is a pure function** (`parseCommand(input, architecture)
  -> CommandResult`) with no React or DOM dependency. It's exercised entirely
  by unit tests; the UI component just calls it and applies the result. This
  is also why architecture updates are immutable — the parser always returns
  a new `Architecture` rather than mutating the one it was given.
- **Node matching is case-insensitive substring matching**, not exact match.
  This is more forgiving of casing/typos than exact match while staying much
  simpler than fuzzy/ranked search; the trade-off is that overlapping labels
  (e.g. "Database" and "Database Replica") could match ambiguously — not a
  concern for the architectures this exercise deals with.
- **The command log doubles as the validation/error-message UI** (a bonus
  item): every command, successful or not, is appended with its outcome, so
  a reviewer can see exactly what was typed and what happened as a result.
  `connect` specifically rejects self-loops ("connect X to X") and duplicate
  edges between the same pair of nodes, rather than silently creating them.
- Visual layout of newly added nodes is a simple left-to-right cascade
  (`x = 250 * index`); there's no automatic re-fit of the viewport after an
  edit, so a node added far to the right may render outside the initial view
  (use the "Fit View" control to recenter).

## What I'd improve with more time

- Auto-fit or auto-pan the view after an edit that adds a node outside the
  current viewport, instead of requiring a manual "Fit View" click.
- A richer node-reference picker (incremental filtering, highlighted matches,
  keyboard navigation) instead of typed labels — useful once architectures
  grow beyond a handful of nodes, but out of scope for this pass.
- Chat-style command history bonus: currently the log is append-only for the
  session; persisting it (or the architecture itself) across reloads would
  need `localStorage` or a backend, neither of which the brief requires.
- Simulation trace exploration (part C of the brief) — a natural next step
  once text-based editing is solid.

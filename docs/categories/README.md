# Category reference

32 focused write-ups, one per implementation area. Each pairs a single-sentence technical claim
with an exact source location and 1-2 Mermaid diagrams of the real control flow - useful for
checking a specific claim against the code without hunting for it. Every bullet below ends with
the `file:line` it documents, so you can jump straight to the code; the root
[`README.md`](../../README.md) links every row to its file, and [`terminology.md`](../terminology.md)
covers the stack and data structures behind them. Grouped the same way the assignment splits
required work from bonus features.

## Required - commands (12)

- **Command parser entry point** - `parseCommand` strips/trims/length-checks input, then tries
  each verb's regex patterns in a fixed order via `matchFirst`.
  (`src/lib/architecture-commands.ts:629-935`)
- **`add node`** - matches four phrasings, validates the label, appends a node positioned by
  current node count. (`src/lib/architecture-commands.ts:587-592,648-679`)
- **`connect` (add edge)** - enforces one outgoing/incoming edge per node; the only new-cycle
  case is closing the chain on itself. (`src/lib/architecture-commands.ts:680-752`)
- **`remove node`** - cascading delete: a single `edges.filter` pass drops every edge touching
  the removed node. (`src/lib/architecture-commands.ts:753-774`)
- **`remove edge`** - resolves both endpoints, finds the edge in O(1) via an index, but still
  deletes with an O(n) filter. (`src/lib/architecture-commands.ts:775-813`)
- **`rename node`** - validates the new label, then unconditionally overwrites the node's
  description. (`src/lib/architecture-commands.ts:814-870`)
- **`move node ... to step ...`** - splices the node into the array and re-derives every x from
  index; edges stay untouched since they reference ids.
  (`src/lib/architecture-commands.ts:871-929`)
- **Suffix-trie substring index** - every suffix of every folded label is indexed, so a lookup
  costs O(query length), not O(nodes). (`src/lib/architecture-commands.ts:124-290`)
- **Label normalization** - separator-splitting does its own lowercasing and skips
  whitespace/invisible-character handling, which callers must do first.
  (`src/lib/node-reference.ts:1-165`)
- **Command errors** - ambiguous-label messages cap the listed names at 20 with an "and N more"
  suffix. (`src/lib/architecture-commands.ts:292-313,933-935`)
- **`parseCommand` call site** - `runCommand` in `ArchitectureWorkspace` is the sole caller;
  state commits only when the result is ok.
  (`src/components/architecture-workspace.tsx:421-495`)
- **Autocomplete ranking** - an ambiguous separator only splits where the untouched side is an
  existing node label. (`src/lib/node-suggestions.ts:1-392`)

## Required - display (7)

- **React Flow canvas** - `reconcileRenderNodes` bridges app state and React Flow's render
  state, preserving live drag position mid-gesture. (`src/components/architecture-canvas.tsx:1-383`)
- **Data model** - `ArchitectureNode`/`Edge` alias `@xyflow/react` types directly; the only
  app-specific addition is an optional `description` on node data.
  (`src/types/architecture.ts:1-39`)
- **Custom node** - reads highlight and action context independently every render, so a rename
  and a highlight can overlap. (`src/components/architecture-node.tsx:1-204`)
- **Custom edge** - self-loops get a hand-computed path with the curve's apex offset above both
  endpoints. (`src/components/architecture-edge.tsx:1-134`)
- **Command console** - auto-scroll sticks to bottom only if the user was already there before
  the update, tracked via a ref. (`src/components/console-panel.tsx:1-287`)
- **Command input** - Up/Down/Enter/Tab route to suggestion navigation first; history recall
  only fires once suggestions are empty. (`src/components/command-input.tsx:1-286`)
- **Canvas -> command synthesis** - mouse gestures (drag-connect, double-click rename) become the
  same command strings the text box accepts. (`src/lib/canvas-commands.ts:1-157`)

## Bonus - simulation (3)

- **Stepper** - an edge highlights only once both endpoints appear in the traversed-node set
  built from step order. (`src/lib/simulation.ts:23-85`)
- **Panel** - Play/Pause drives a recursive `setTimeout`, not `setInterval`, so every tick
  re-reads the current step and speed. (`src/components/simulation-panel.tsx:1-146`)
- **Drag-to-reorder steps** - two `useState` values track dragged/drag-over index; `onDragEnd`
  always resets both. (`src/components/simulation-timeline.tsx:1-142`)

## Bonus - extras (5)

- **Import/export/merge** - both enforce label uniqueness; import rejects the whole file on
  collision, merge silently renames the incoming node. (`src/lib/architecture-io.ts:26-464`)
- **Merge picker dialog** - source/target are recomputed from the graph every render, so a stale
  selection falls back automatically. (`src/components/merge-picker-dialog.tsx:1-542`)
- **Undo/redo** - two stacks of `{ command, snapshot }` pairs; any new command clears redo, so
  redo only follows an undo. (`src/lib/undo-history.ts:26-138`)
- **Persistence + tab sync** - a cross-tab `storage` event is classified
  irrelevant/cleared/invalid/updated; an invalid write gets self-healed by the receiving tab.
  (`src/lib/persistence.ts:38,97-241`)
- **Command recall** - Up/Down exits recall and restores the frozen draft once the index hits 0,
  mirroring shell history. (`src/lib/command-history.ts:1-64`)

## Performance (3)

- **MiniMap guard** - the minimap is omitted above 300 nodes since it repaints every node
  position on each mutation. (`src/components/architecture-canvas.tsx:152,346-356`)
- **`fitView` debounce** - bursts of node changes collapse into one animated `fitView` 300ms
  after the last change settles. (`src/components/architecture-canvas.tsx:154-189`)
- **Drag-position fix** - per-frame drag `position` changes are filtered out so autosave doesn't
  fire on every drag frame. (`src/lib/node-changes.ts:1-35`)

## Tests (2)

- **Parser tests** - five files, 1,873 lines; adversarial label cases are asserted individually
  rather than table-driven. (`src/lib/test/architecture-commands-*.test.ts`)
- **Component tests** - React Testing Library renders under jsdom; assertions target rendered
  output and mock callbacks, not internal state. (`src/components/test/`)

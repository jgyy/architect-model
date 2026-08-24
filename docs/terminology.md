# Terminology

Stack, type patterns, and the data structures/algorithms behind them - not a feature glossary
(see the "Where to point" table in the [README](../README.md) for that). Grounded in the code
that uses each term.

## Framework & runtime

- **Next.js App Router** - routes live in `src/app/` as files (`layout.tsx`, `page.tsx`), not a
  pages-directory config. Version 16.3.1. `package.json:19`
- **Server Component / Client Component boundary** - `src/app/page.tsx` has no `"use client"`
  directive, so it renders on the server with zero client JS of its own; it mounts
  `ArchitectureWorkspace`, which opens with `"use client"` because it needs `useState`/`useEffect`
  for interactivity. Every stateful component in `src/components/` follows the same split.
  `src/app/page.tsx:1-4`
- **`next/font`** - self-hosts and subsets Google Fonts (Inter, JetBrains Mono) at build time,
  exposing them as CSS variables instead of a runtime `<link>` fetch. `src/app/layout.tsx:2,5-13`
- **React 19** - the component runtime; version pinned exactly (`19.2.8`, no caret) alongside
  `react-dom`. `package.json:20-21`

## Styling

- **Tailwind CSS v4** - configured CSS-first: no `tailwind.config.*` file, just
  `@import "tailwindcss";` plus an `@theme inline { ... }` block mapping custom properties
  (`--color-accent`, etc.) to Tailwind's token namespace. `src/app/globals.css:1,18-25`
- **PostCSS** - runs Tailwind as a single plugin (`@tailwindcss/postcss`); no autoprefixer or other
  plugins in the chain. `postcss.config.mjs:1-5`

## UI / graph rendering

- **`@xyflow/react` (React Flow)** - the diagramming library the canvas is built on; supplies
  `<ReactFlow>`, drag/connect gestures, and the `Node<T>`/`Edge` generics the app's own types
  extend. `package.json:17`
- **Custom node/edge types** - React Flow lets you register renderers under a type key; this app
  registers exactly one each (`{ default: ArchitectureNodeCard }`, `{ default: ArchitectureEdgeCard }`),
  overriding React Flow's built-in box/line rendering everywhere.
  `src/components/architecture-canvas.tsx:108-109`
- **`lucide-react`** - the icon set (`X`, `Play`, `Pause`, `Undo2`, etc.) used across the console
  and canvas UI. `package.json:18`

## Language & type system

- **TypeScript strict mode** - `strict: true` in `tsconfig.json`, so `noImplicitAny`,
  `strictNullChecks`, etc. are all on; every `?? fallback` and `?:` optional field in the codebase
  is load-bearing, not decorative. `tsconfig.json:7`
- **Path alias** - `@/*` resolves to `src/*`, configured once in `tsconfig.json` and mirrored in
  `vitest.config.mts` so imports resolve the same way in the app and in tests.
  `tsconfig.json:21-23`, `vitest.config.mts:5-8`
- **Generic type instantiation** - `ArchitectureNode` isn't a hand-written type; it's React Flow's
  generic `Node<T>` instantiated with this app's own data shape (`Node<ArchitectureNodeData>`).
  `src/types/architecture.ts:9`
- **Discriminated union result type** - the recurring return shape
  `{ ok: true; ...payload } | { ok: false; message: string }`, used instead of throwing, so every
  call site is forced by the type checker to handle failure before touching the payload. Appears as
  `CommandResult`, `UndoRedoResult`, `ImportArchitectureResult`, `MergeArchitectureSuccess`.
  `src/lib/architecture-commands.ts:29-35`, `src/lib/undo-history.ts:38-45`,
  `src/lib/architecture-io.ts:28-35`
- **Readonly collection types** - `ReadonlySet`/`ReadonlyArray` parameter types on functions like
  `mergeSelectedArchitecture` document (and let the compiler enforce) that the function only reads
  its collection arguments, never mutates them. `src/lib/architecture-io.ts:264-269`
- **Utility type (`Pick`)** - `StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">`
  narrows the real `Storage` interface to the three methods actually used, so tests can pass a
  plain object instead of a real `localStorage`. `src/lib/persistence.ts:22`

## Tooling

- **ESLint 9 flat config** - `eslint.config.mjs` exports an array of config objects (no `.eslintrc`),
  composing `eslint-config-next`'s Core Web Vitals and TypeScript rule sets plus one project rule
  (`max-lines: 1000`). `eslint.config.mjs:1-19`
- **Prettier** - formatting-only, run separately from lint (`npm run format`); not wired in as an
  ESLint rule. `package.json:11-12`
- **Vitest** - the test runner (`vitest run`), configured with `environment: "node"` rather than a
  browser-like DOM environment. `vitest.config.mts:10-13`
- **jsdom** - a DOM implementation, used to polyfill browser-only APIs Vitest's Node environment
  doesn't provide - `ResizeObserver` and `DOMMatrixReadOnly` are stubbed by hand in
  `vitest.setup.ts` because React Flow depends on both and real jsdom implements neither.
  `vitest.setup.ts:1-38`
- **Testing Library** (`@testing-library/react`, `-jest-dom`, `-user-event`) - queries and
  simulates user interaction against rendered output rather than component internals;
  `jest-dom`'s matchers (`toBeInTheDocument`, etc.) are registered globally in the setup file.
  `vitest.setup.ts:1`
- **`tsc --noEmit`** - the typecheck script; compiles for diagnostics only; `next build` handles
  actual emission separately. `package.json:10`
- **`npm run check`** - the combined gate (`lint && typecheck && format && test`) run before
  considering a change done. `package.json:14`

## Data structures

- **Suffix trie (substring index)** - a trie keyed by character, built by inserting every suffix
  of every folded node label; each trie node caches the set of labels passing through it, so a
  substring query is a walk of `needle.length` character-steps rather than a scan of every node.
  Backs both node-reference resolution and autocomplete. `src/lib/architecture-commands.ts:84-139`
- **Two-stack undo/redo** - `undoStack`/`redoStack`, both arrays of `{ command, snapshot }`;
  `undo`/`redo` pop one, push its inverse onto the other. A capped array (`slice` to the last 500)
  standing in for a ring buffer. `src/lib/undo-history.ts:9-36`
- **`Map`/`Set`-backed index (`NodeIndex`)** - one object bundling four `Map`s and a `Set`
  (label→node, id membership, edge-by-key, edge-by-source, edge-by-target) built once per command
  instead of re-deriving lookups from arrays on every access. `src/lib/architecture-commands.ts:71-78`
- **Degree-constrained graph** - the architecture's edges aren't a general graph; the parser
  enforces at most one outgoing and one incoming edge per node
  (`outgoingBySource`/`incomingByTarget` are `Map<string, Edge>`, not `Map<string, Edge[]>`), so
  the traversable structure is really a set of disjoint chains. `src/lib/architecture-commands.ts:75-76`

## Algorithms

- **Cycle check via forward walk** (`wouldCreateCycle`) - before adding an edge, walks forward
  from the proposed target following `outgoingBySource` until it either reaches the proposed
  source (cycle) or a dead end; a `visited` set bounds the walk in case existing data is already
  cyclic. `src/lib/architecture-commands.ts:169-185`
- **Cycle check via in-degree + reachability** (`findCyclicNodeId`) - a stripped-down first phase
  of Kahn's algorithm: compute in-degree per node, walk forward only from nodes with in-degree 0,
  and any node never reached is on a cycle. Used to re-validate an imported file's edges rather
  than trusting it. `src/lib/architecture-io.ts:38-56`
- **Debounce** - `fitView`'s re-frame is delayed 300ms and reset on every dependency change, so a
  burst of rapid node mutations triggers one re-frame instead of one per mutation.
  `src/components/architecture-canvas.tsx:116-132`
- **Memoization** (`useMemo`/`useCallback`) - used throughout the canvas and command-suggestion
  code to keep derived values and handler identities stable across renders, avoiding both
  recomputation and unnecessary child re-renders. `src/components/architecture-canvas.tsx:162-245`
- **Complexity notes from the code's own comments** - the substring index is called out as
  `O(query length)` rather than `O(nodes)` per lookup; the `NodeIndex` map lookups are `O(1)`
  average versus an `O(n)` `Array.find` per node reference. `src/lib/architecture-commands.ts:119`,
  `src/lib/node-suggestions.ts:44`

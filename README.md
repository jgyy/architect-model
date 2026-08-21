# architect-model

A small web app for updating a system architecture (nodes + edges) via text
input and exploring a simulation trace through it. See
[`docs/programming-assignment.md`](docs/programming-assignment.md) for the
full brief.

## Status

**Step 1 (current):** Next.js + TypeScript scaffold with the architecture
rendered visually via [React Flow](https://reactflow.dev), seeded with the
example Internet → Web Server → Database architecture. Text-based editing and
simulation exploration are not implemented yet.

## Run locally

```bash
npm install
npm run dev
```

Then open http://localhost:3000.

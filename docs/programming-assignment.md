# Take-Home Exercise: Architecture Update via Chat Input & Simulation Exploration

## Goal

Build a small web application that demonstrates:

1. Updating a system architecture (nodes + edges) using text-based user input
2. Exploring a simulation trace that progresses through architecture components

A real chatbot or LLM is not required.
You may use any reasonable approach to interpret user input.

## Tech expectations

- Frontend: any modern web stack (React recommended; TypeScript preferred but optional)
- Backend: optional
- Visual rendering of nodes/edges is optional
- Architecture data must be compatible with React Flow's Node and Edge formats
  - References:
    - https://reactflow.dev/docs/api/nodes/
    - https://reactflow.dev/docs/api/edges/

## Architecture model (example only)

The following is an example of how architecture data might be represented.
You are free to design your own structure as long as it remains compatible with React Flow.

```json
{
  "nodes": [
    {
      "id": "node_11111111-1111-1111-1111-111111111111",
      "position": { "x": 0, "y": 0 },
      "data": { "label": "Internet" }
    },
    {
      "id": "node_22222222-2222-2222-2222-222222222222",
      "position": { "x": 250, "y": 0 },
      "data": { "label": "Web Server" }
    },
    {
      "id": "node_33333333-3333-3333-3333-333333333333",
      "position": { "x": 500, "y": 0 },
      "data": { "label": "Database" }
    }
  ],
  "edges": [
    {
      "id": "edge_aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
      "source": "node_11111111-1111-1111-1111-111111111111",
      "target": "node_22222222-2222-2222-2222-222222222222"
    },
    {
      "id": "edge_bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
      "source": "node_22222222-2222-2222-2222-222222222222",
      "target": "node_33333333-3333-3333-3333-333333333333"
    }
  ]
}
```

## Simulation trace (example only)

```json
[
  {
    "step": 1,
    "nodeId": "node_11111111-1111-1111-1111-111111111111",
    "description": "Attacker starts from Internet"
  },
  {
    "step": 2,
    "nodeId": "node_22222222-2222-2222-2222-222222222222",
    "description": "Attacker reaches Web Server"
  },
  {
    "step": 3,
    "nodeId": "node_33333333-3333-3333-3333-333333333333",
    "description": "Attacker accesses Database"
  }
]
```

## Functional requirements

### A) Architecture updates via text input (required)

Your application must allow users to enter text instructions that result in changes to the architecture.

At minimum, support:

- Adding a node
- Adding an edge between existing nodes
- Removing a node (and any edges connected to it)
- Removing an edge

You may decide:

- What commands or phrasing are supported
- How flexible the input interpretation is

### B) Architecture display (required)

Your application must clearly present the current state of the system architecture so that a reviewer can easily understand:

- What nodes exist
- How nodes are connected by edges

This can be done in either of the following ways:

**Option 1: Visual representation**

Display nodes and edges visually (for example, using React Flow or any other diagramming approach).

**Option 2: Structured textual representation**

Display nodes and edges as structured lists or tables, for example:

- A list of nodes showing at least the node ID and label
- A list of edges showing source → target

The presentation does not need to be visually polished.
It must simply make the architecture relationships clear and easy to verify after updates.

### C) Simulation exploration (optional)

If implemented, your application may:

- Show the current simulation step and description
- Allow users to move forward/backward through steps
- Highlight the node associated with the current step

A simple textual implementation is sufficient.

## Deliverables

### 1) Source code

Provide one of the following:

- A GitHub repository link, or
- A zip archive of the project

**Do NOT include:**

- `node_modules/`
- `venv/`
- Build artifacts

### 2) README.md (required)

Include:

- How to run the application locally
- Examples of supported inputs and expected behavior
- Key design decisions and assumptions
- What you would improve with more time

### 3) Demo proof (required)

Provide one:

- A short screen recording (30–90 seconds), or
- 3–5 screenshots demonstrating:
  - Architecture before and after a text-based update
  - (Optional) Simulation step highlighting

## Bonus (optional)

- More flexible input handling
- Chat history
- Visual rendering using React Flow
- Simple validation or error messages

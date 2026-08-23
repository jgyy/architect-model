# Sample architecture files

Manual-testing fixtures for the **Import** and **Merge** toolbar buttons. None of these are
loaded by the app automatically - upload them yourself via the file picker.

| File                                 | Use with        | What it exercises                                                                                                                                                                                                                                                              |
| ------------------------------------ | --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `import-full-architecture.json`      | Import          | Replaces the whole architecture with a 5-node chain (Internet → Load Balancer → App Server → Database → Backup Storage).                                                                                                                                                       |
| `merge-disjoint-connect-me.json`     | Merge           | Three nodes (Message Queue, Cache, Worker) with no edges - nothing to include/exclude, so the picker's **Connect** control is the only way to link them. Try adding Queue → Worker, then Worker → Cache, then notice Cache → Queue is no longer offered (would close a cycle). |
| `merge-with-edge-and-collision.json` | Merge           | "Web Server" collides with the seeded example's node (renamed to "Web Server (2)"); Auth Service → Web Server is an existing edge you can uncheck; Notification Service is disjoint, so you can also use **Connect** here alongside the checkboxes.                            |
| `invalid-cycle.json`                 | Import or Merge | Valid JSON shape, but A → B → C → A is a cycle - rejected with "The edges form a loop through node ...".                                                                                                                                                                       |
| `invalid-malformed.json`             | Import or Merge | Not valid JSON (missing closing braces) - rejected with "That file isn't valid JSON."                                                                                                                                                                                          |

## Suggested run-through

1. **Import** `import-full-architecture.json` - confirm it fully replaces the seeded example.
2. Reload (or click **Clear history**) to get back to the seeded example.
3. **Merge** `merge-disjoint-connect-me.json` - select all 3 nodes, use Connect to add two links,
   confirm the log reports the right node/edge counts, then **Undo** to revert.
4. **Merge** `merge-with-edge-and-collision.json` - watch the "will be renamed" hint, try
   unchecking the Auth Service → Web Server edge, and connect Notification Service to something.
5. Try **Import** and **Merge** with `invalid-cycle.json` and `invalid-malformed.json` - both
   should be rejected with an inline error and leave the current architecture untouched.

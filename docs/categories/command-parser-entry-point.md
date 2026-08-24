# Command parser entry point (all 6 verbs)

`parseCommand` strips invisible characters, trims, rejects input over `MAX_COMMAND_LENGTH`, then tests each verb's regex patterns in a fixed, short-circuiting order via `matchFirst`, so the first matching verb's branch runs while later verbs are never tested.

**Source:** `src/lib/architecture-commands.ts:88-394`

**Trim, length guard, and the add/connect/remove-node branches**

```mermaid
flowchart TD
    Start["parseCommand(input)"] --> Trim["stripInvisibleChars + trim"]
    Trim --> LenCheck{"length > MAX_COMMAND_LENGTH?"}
    LenCheck -->|yes| ErrLen["error: Command is too long"]
    LenCheck -->|no| AddM{"matches ADD_NODE_PATTERNS?"}

    AddM -->|yes| AddNode["add node handler:\nvalidate label, check duplicate,\nappend node"]
    AddM -->|no| ConnM{"matches CONNECT_PATTERNS?"}

    ConnM -->|yes| Connect["connect handler:\nresolveConnectionEndpoints,\ncheck self/dup/cycle,\nappend edge"]
    ConnM -->|no| RemNM{"matches REMOVE_NODE_PATTERNS?"}

    RemNM -->|yes| RemoveNode["remove node handler:\nfindNodeOrAmbiguity,\nfilter node + its edges"]

    AddNode --> Result["CommandResult { ok, architecture?, message }"]
    Connect --> Result
    RemoveNode --> Result
```

**Remove-edge/rename/move-node branches and the fallback**

```mermaid
flowchart TD
    RemNM{"matches REMOVE_NODE_PATTERNS?"} -->|no| RemEM{"matches REMOVE_EDGE_PATTERNS?"}

    RemEM -->|yes| RemoveEdge["remove edge handler:\nresolveConnectionEndpoints,\nlookup edgesBySourceTarget,\nfilter edge"]
    RemEM -->|no| RenM{"matches RENAME_NODE_PATTERNS?"}

    RenM -->|yes| Rename["rename node handler:\nresolveRenameArgs,\nvalidate + dedupe new label,\nmap node"]
    RenM -->|no| MoveM{"matches MOVE_NODE_PATTERNS?"}

    MoveM -->|yes| MoveNode["move node handler:\nresolveMoveNodeArgs,\nvalidate step number,\nreorder + re-space x"]
    MoveM -->|no| Unrecognized["error: Unrecognized command\n+ usage text"]

    RemoveEdge --> Result["CommandResult { ok, architecture?, message }"]
    Rename --> Result
    MoveNode --> Result
```

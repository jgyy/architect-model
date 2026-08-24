# Command parser entry point (all 6 verbs)

`parseCommand` is the single entry point every typed command passes through. It strips invisible characters and trims the input, rejects anything over `MAX_COMMAND_LENGTH`, then tries each verb's regex pattern list in a fixed order via `matchFirst`: add node, connect, remove node, remove edge, rename node, move node. The first pattern that matches wins and its branch runs to completion (validating labels/nodes, checking for duplicates, cycles, or out-of-range steps) and returns a `CommandResult` immediately, so branches are mutually exclusive and later patterns never see input matched earlier. If none of the six pattern lists match, the function falls through to a single `Unrecognized command` result listing usage.

**Source:** `src/lib/architecture-commands.ts:425-731`

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

A subtle detail the diagram surfaces: the checks are strictly sequential and short-circuiting, so a string could textually match a later verb's pattern too, but it is only ever tested against that later pattern if every earlier verb's pattern already failed to match.

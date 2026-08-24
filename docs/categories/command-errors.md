# Unrecognized / ambiguous command errors

`parseCommand` tries each command pattern (add-node, connect, rename, move, ...) against the trimmed input in sequence; if none of the `matchFirst(PATTERN, trimmed)` checks match anything, execution falls through every branch to the final `return` at the bottom of the function, which reports the input as an unrecognized command and lists usage. A second, unrelated kind of error happens *inside* a matched branch: when a typed label resolves via substring search to more than one node, `findNodeOrAmbiguity` returns an array instead of a single node, and `ambiguousLabelMessage` formats that array into a message. That formatter caps the listed names at `AMBIGUOUS_MATCHES_SHOWN` (20) and folds any remainder into an "and N more" suffix so a label matching hundreds of nodes doesn't produce an unreadable wall of text.

**Source:** `src/lib/architecture-commands.ts:201-214,729-731`

```mermaid
flowchart TD
    A["parseCommand(input)"] --> B["trimmed = stripInvisibleChars(input).trim()"]
    B --> C{"matchFirst(PATTERN, trimmed)\nfor add/connect/rename/move/..."}
    C -->|"no pattern matched"| D["fall through to final return"]
    D --> E["Unrecognized command: trimmed\n+ UNRECOGNIZED_COMMAND_USAGE\n+ help hint"]

    C -->|"pattern matched"| F["findNodeOrAmbiguity(label, nodeIndex)"]
    F --> G{"matches.length"}
    G -->|"0"| H["return null -> No node named label"]
    G -->|"1"| I["return matches[0] -> single node"]
    G -->|">1"| J["return matches[] -> ambiguousLabelMessage(label, matches)"]
    J --> K["shown = matches.slice(0, AMBIGUOUS_MATCHES_SHOWN=20)"]
    K --> L{"matches.length > 20?"}
    L -->|"yes"| M["names + and N more"]
    L -->|"no"| N["names = shown list"]
    M --> O["label matches multiple nodes: names. Be more specific."]
    N --> O
```

The 20-match cap is the non-obvious part: `ambiguousLabelMessage` is only reached once a label already matched *more than one* node, so the cap exists purely to bound the error message's own length, not the search itself.

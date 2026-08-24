# Unrecognized / ambiguous command errors

When `findNodeOrAmbiguity` resolves a label to more than one node, `ambiguousLabelMessage` caps the listed names at `AMBIGUOUS_MATCHES_SHOWN` (20), appending an "and N more" suffix so a label matching hundreds of nodes stays readable.

**Source:** `src/lib/architecture-commands.ts:292-313,933-935`

**Pattern matching and unrecognized commands**

```mermaid
flowchart TD
    A["parseCommand(input)"] --> B["trimmed = stripInvisibleChars(input).trim()"]
    B --> C{"matchFirst(PATTERN, trimmed)\nfor add/connect/rename/move/..."}
    C -->|"no pattern matched"| D["fall through to final return"]
    D --> E["Unrecognized command: trimmed\n+ UNRECOGNIZED_COMMAND_USAGE\n+ help hint"]
```

**Node resolution and ambiguity messaging**

```mermaid
flowchart TD
    C{"matchFirst(PATTERN, trimmed)\nfor add/connect/rename/move/..."} -->|"pattern matched"| F["findNodeOrAmbiguity(label, nodeIndex)"]
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

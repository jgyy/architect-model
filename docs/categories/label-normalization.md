# Regex fragments & label normalization

`findSeparatorOccurrences` does its own lowercasing rather than reusing `foldLabel`, and skips whitespace/invisible-character normalization entirely, scanning only the already-normalized `rest` argument and leaving callers responsible for running `normalizeLabel` first.

**Source:** `src/lib/node-reference.ts:1-165`

**Normalizing and folding labels**

```mermaid
flowchart LR
    A["Raw input string"] --> B["stripInvisibleChars\n(strip zero-width chars / BOM)"]
    B --> C["normalizeLabel\n(NFC -> trim -> collapse whitespace)"]
    A --> D["foldLabel\n(NFC -> lowercase)"]
    D --> F["Equality / dedupe checks\n(foldLabel vs foldLabel)"]
```

**Scanning a normalized label for separator words**

```mermaid
flowchart LR
    C["normalizeLabel\n(NFC -> trim -> collapse whitespace)"] --> E{"Used for?"}
    E -->|"parsing rest of command"| G["findSeparatorOccurrences\n(rest, separators[])"]
    G --> H["lower = rest.toLowerCase()"]
    H --> I["for each separator word:\nindexOf scan left to right"]
    I --> J["push {index, length} per match"]
    J --> K["splits[] returned to caller"]
```

# Suffix trie substring index

`NodeIndex` maintains a trie built from every suffix of every node's folded label (`foldLabel`: NFC-normalize + lowercase). `insertSuffixes` walks each starting position of a label's characters, creating a child per character and recording the owning `ArchitectureNode` in that child's `matches` set, so any prefix-of-a-suffix (i.e. any substring) of the label is reachable as a trie path. `querySubstringIndex` then answers "which nodes contain this substring" in O(needle length) by walking the trie by the needle's characters and returning the `matches` set at the final node. This lets `findNodeOrAmbiguity` fall back from an exact-label lookup to a substring search - and report ambiguity - without scanning every node's label on each command.

**Source:** `src/lib/architecture-commands.ts:84-199`

```mermaid
flowchart TD
    subgraph Build["buildSubstringIndex(nodes)"]
        A[createSubstringTrieNode root] --> B[insertSuffixes for each node]
        B --> C{for each start index<br/>in folded label}
        C --> D[walk/create child per char<br/>from start to end]
        D --> E[add node to current.matches<br/>at every step]
        E --> C
    end

    subgraph Query["querySubstringIndex(root, needle)"]
        Q1[current = root] --> Q2{for each char in needle}
        Q2 -->|child exists| Q3[current = child]
        Q3 --> Q2
        Q2 -->|no child found| Q4["return []"]
        Q2 -->|needle exhausted| Q5[return Array.from<br/>current.matches]
    end

    Build -.builds.-> Trie[(SubstringTrieNode:<br/>children Map + matches Set)]
    Query -.reads.-> Trie

    Trie --> Caller1[findNodesBySubstring<br/>public export]
    Trie --> Caller2[findNodeOrAmbiguity<br/>exact byLabel miss, then substring fallback]
```

Because every suffix is inserted separately, a single label of length n contributes O(n^2) trie edges but makes every one of its substrings a valid query path - the same trie node ends up in the `matches` set of every node whose label contains that substring, which is what lets `findNodeOrAmbiguity` detect and report multi-node ambiguity in one lookup.

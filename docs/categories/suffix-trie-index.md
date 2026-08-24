# Suffix trie substring index

`NodeIndex` builds a trie from every suffix of each node's folded label via `insertSuffixes`, so every substring becomes a valid trie path whose terminal `matches` set collects every node containing it.

**Source:** `src/lib/node-index.ts:25-140`, `src/lib/command-resolution.ts:61-73`

**Building the trie**

```mermaid
flowchart TD
    subgraph Build["buildSubstringIndex(nodes)"]
        A[createSubstringTrieNode root] --> B[insertSuffixes for each node]
        B --> C{for each start index<br/>in folded label}
        C --> D[walk/create child per char<br/>from start to end]
        D --> E[add node to current.matches<br/>at every step]
        E --> C
    end

    Build -.builds.-> Trie[(SubstringTrieNode:<br/>children Map + matches Set)]
```

**Querying and consuming the index**

```mermaid
flowchart TD
    subgraph Query["querySubstringIndex(root, needle)"]
        Q1[current = root] --> Q2{for each char in needle}
        Q2 -->|child exists| Q3[current = child]
        Q3 --> Q2
        Q2 -->|no child found| Q4["return []"]
        Q2 -->|needle exhausted| Q5[return Array.from<br/>current.matches]
    end

    Trie[(SubstringTrieNode:<br/>children Map + matches Set)] -.reads.-> Query

    Trie --> Caller1[findNodesBySubstring<br/>public export]
    Trie --> Caller2[findNodeOrAmbiguity<br/>exact byLabel miss, then substring fallback]
```


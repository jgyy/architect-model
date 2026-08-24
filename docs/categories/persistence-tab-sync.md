# Persistence (localStorage) + tab sync

`persistence.ts` stores the whole session (architecture graph, command log, simulation step, and speed index) under one `STORAGE_KEY` (`"architect-model:session"`), and validates rather than trusts whatever comes back out. `loadPersistedState` and `interpretStorageEvent` both funnel through the same `parsePersistedState`, which structurally checks every node and edge with `isArchitectureNode`/`isArchitectureEdge` and falls back to `stepIndex: 0, speedIndex: DEFAULT_SPEED_INDEX` for sessions saved before those fields existed. `savePersistedState`/`clearPersistedState`/`loadPersistedState` all wrap their storage call in try/catch and return a boolean or `null` instead of throwing, so a full or disabled localStorage degrades gracefully. `interpretStorageEvent` classifies a browser `storage` event (which only fires in *other* tabs) into `irrelevant` / `cleared` / `invalid` / `updated`, letting the caller in `architecture-workspace.tsx` react without re-deriving that logic itself.

**Source:** `src/lib/persistence.ts:24,64-170`

```mermaid
sequenceDiagram
    participant A as Tab A
    participant LS as localStorage
    participant B as Tab B (handleStorage)

    A->>A: savePersistedState(storage, nextState)
    A->>LS: setItem(STORAGE_KEY, JSON.stringify(nextState))
    LS-->>B: "storage" event (key, newValue)
    B->>B: interpretStorageEvent(event.key, event.newValue)
    alt key !== STORAGE_KEY
        B->>B: type: "irrelevant"
    else newValue === null
        B->>B: type: "cleared" -> resetToInitial()
    else JSON.parse fails or parsePersistedState fails
        B->>B: type: "invalid" -> re-save latestStateRef
    else parsePersistedState succeeds
        B->>B: type: "updated" -> applyPersisted(state)
    end
```

The "invalid" branch is the subtle part: if another tab writes something `interpretStorageEvent` can't parse, Tab B doesn't just ignore it -- it overwrites `STORAGE_KEY` with its own `latestStateRef`, effectively self-healing corrupted storage using whichever tab notices first.

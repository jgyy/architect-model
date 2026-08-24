# Persistence (localStorage) + tab sync

`interpretStorageEvent` classifies a cross-tab browser `storage` event into `irrelevant`/`cleared`/`invalid`/`updated`, and on `invalid` — data another tab wrote that fails to parse — the receiving tab self-heals by overwriting `STORAGE_KEY` with its own `latestStateRef` rather than ignoring the write.

**Source:** `src/lib/persistence.ts:27,71-203`

**Save and cross-tab storage event**

```mermaid
sequenceDiagram
    participant A as Tab A
    participant LS as localStorage
    participant B as Tab B (handleStorage)

    A->>A: savePersistedState(storage, nextState)
    A->>LS: setItem(STORAGE_KEY, JSON.stringify(nextState))
    LS-->>B: "storage" event (key, newValue)
    B->>B: interpretStorageEvent(event.key, event.newValue)
```

**Classifying the storage event**

```mermaid
sequenceDiagram
    participant B as Tab B (handleStorage)

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

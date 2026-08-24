import { DEFAULT_SPEED_INDEX } from "@/lib/simulation";
import type {
    Architecture,
    ArchitectureEdge,
    ArchitectureNode,
} from "@/types/architecture";

/** One command-log entry; also the shape persisted/restored across sessions. */
export type LogEntry = {
    id: number;
    input: string;
    ok: boolean;
    message: string;
};

/** Full app-state snapshot for storage: graph, log, and simulation playback position. */
export type PersistedState = {
    architecture: Architecture;
    log: LogEntry[];
    stepIndex: number;
    speedIndex: number;
};

/** Minimal `Storage` subset used here - lets tests pass a plain object instead of the full browser API. */
export type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;

const STORAGE_KEY = "architect-model:session";

function isRecord(value: unknown): value is Record<string, unknown> {
    return !!value && typeof value === "object";
}

/** Runtime shape check for a parsed-JSON architecture node (id, position, data.label). */
function isArchitectureNode(value: unknown): value is ArchitectureNode {
    if (!isRecord(value)) return false;
    const position = value.position;
    const data = value.data;
    return (
        typeof value.id === "string" &&
        isRecord(position) &&
        typeof position.x === "number" &&
        typeof position.y === "number" &&
        isRecord(data) &&
        typeof data.label === "string" &&
        (data.description === undefined || typeof data.description === "string")
    );
}

/** Runtime shape check for an architecture edge. */
function isArchitectureEdge(value: unknown): value is ArchitectureEdge {
    if (!isRecord(value)) return false;
    return (
        typeof value.id === "string" &&
        typeof value.source === "string" &&
        typeof value.target === "string"
    );
}

/** Runtime shape check for a persisted `LogEntry`. */
function isLogEntry(value: unknown): value is LogEntry {
    if (!isRecord(value)) return false;
    return (
        typeof value.id === "number" &&
        typeof value.input === "string" &&
        typeof value.ok === "boolean" &&
        typeof value.message === "string"
    );
}

/** Validates a parsed JSON value as a full `Architecture`; gates whether storage-read data is trusted or rejected as corrupt. */
export function isValidArchitecture(value: unknown): value is Architecture {
    return (
        isRecord(value) &&
        Array.isArray(value.nodes) &&
        value.nodes.every(isArchitectureNode) &&
        Array.isArray(value.edges) &&
        value.edges.every(isArchitectureEdge)
    );
}

/**
 * Parses raw JSON into a `PersistedState`; null on mismatch. Migrates
 * pre-stepIndex/speedIndex sessions by defaulting them.
 */
function parsePersistedState(value: unknown): PersistedState | null {
    if (!isRecord(value)) return null;
    if (!isValidArchitecture(value.architecture)) return null;
    if (!Array.isArray(value.log) || !value.log.every(isLogEntry)) {
        return null;
    }

    const isLegacySession =
        value.stepIndex === undefined && value.speedIndex === undefined;
    if (isLegacySession) {
        return {
            architecture: value.architecture,
            log: value.log,
            stepIndex: 0,
            speedIndex: DEFAULT_SPEED_INDEX,
        };
    }

    if (
        typeof value.stepIndex !== "number" ||
        typeof value.speedIndex !== "number"
    ) {
        return null;
    }

    return {
        architecture: value.architecture,
        log: value.log,
        stepIndex: value.stepIndex,
        speedIndex: value.speedIndex,
    };
}

/**
 * Reads and parses persisted state; null on missing/unreadable/invalid data - all failures start fresh.
 * @param storage - real or test double
 * @returns parsed state, or null
 */
export function loadPersistedState(
    storage: StorageLike,
): PersistedState | null {
    let raw: string | null;
    try {
        raw = storage.getItem(STORAGE_KEY);
    } catch {
        return null;
    }
    if (!raw) return null;
    try {
        const parsed = JSON.parse(raw);
        return parsePersistedState(parsed);
    } catch {
        return null;
    }
}

/**
 * Writes state as JSON under this app's key. Failures are caught, not
 * thrown - persistence is a convenience, not required for command success.
 * @param state - snapshot to persist
 * @returns whether the write succeeded
 */
export function savePersistedState(
    storage: StorageLike,
    state: PersistedState,
): boolean {
    try {
        storage.setItem(STORAGE_KEY, JSON.stringify(state));
        return true;
    } catch {
        return false;
    }
}

/**
 * Removes persisted state, e.g. on explicit reset; failures caught, not thrown.
 * @returns whether removal succeeded
 */
export function clearPersistedState(storage: StorageLike): boolean {
    try {
        storage.removeItem(STORAGE_KEY);
        return true;
    } catch {
        return false;
    }
}

/**
 * Discriminated union describing a `storage` event: `irrelevant` (other
 * key), `cleared`, `invalid` (failed parse), or `updated` (new state).
 */
export type PersistedStateChange =
    | { type: "irrelevant" }
    | { type: "cleared" }
    | { type: "invalid" }
    | { type: "updated"; state: PersistedState };

/**
 * Classifies a `storage` event so another tab can react to a change made
 * elsewhere; re-parses/validates like `loadPersistedState` since events
 * carry only a raw value.
 * @param key - event's storage key (null on some browser clears)
 * @param newValue - raw new value, or null if removed
 * @returns tagged description of the change
 */
export function interpretStorageEvent(
    key: string | null,
    newValue: string | null,
): PersistedStateChange {
    if (key !== null && key !== STORAGE_KEY) return { type: "irrelevant" };
    if (newValue === null) return { type: "cleared" };
    try {
        const parsed = JSON.parse(newValue);
        const state = parsePersistedState(parsed);
        return state ? { type: "updated", state } : { type: "invalid" };
    } catch {
        return { type: "invalid" };
    }
}

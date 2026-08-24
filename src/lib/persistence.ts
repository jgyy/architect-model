import { DEFAULT_SPEED_INDEX } from "@/lib/simulation";
import type {
    Architecture,
    ArchitectureEdge,
    ArchitectureNode,
} from "@/types/architecture";

/**
 * One command-log entry: the submitted command, whether it succeeded, and
 * the shown message. Also the shape persisted and restored across sessions.
 */
export type LogEntry = {
    id: number;
    input: string;
    ok: boolean;
    message: string;
};

/**
 * Full app-state snapshot for storage: architecture graph, command log, and
 * simulation playback position (step, speed). Saved whenever any of these
 * change and restored on load, so a session survives a refresh or new tab.
 */
export type PersistedState = {
    architecture: Architecture;
    log: LogEntry[];
    stepIndex: number;
    speedIndex: number;
};

/**
 * Subset of `Storage` (localStorage/sessionStorage) this module uses:
 * `getItem`, `setItem`, `removeItem`, via `Pick`. Lets tests pass a plain
 * in-memory object instead of stubbing the full browser API.
 */
export type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;

const STORAGE_KEY = "architect-model:session";

function isRecord(value: unknown): value is Record<string, unknown> {
    return !!value && typeof value === "object";
}

/**
 * Runtime shape check for one architecture node from parsed JSON, since
 * JSON data can't be trusted at compile time. Checks a string id, `{x, y}`
 * position, and a `data` object with required label and optional
 * description.
 */
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

/**
 * Runtime shape check for an architecture edge: verifies string `id`,
 * `source`, and `target` fields.
 */
function isArchitectureEdge(value: unknown): value is ArchitectureEdge {
    if (!isRecord(value)) return false;
    return (
        typeof value.id === "string" &&
        typeof value.source === "string" &&
        typeof value.target === "string"
    );
}

/**
 * Verifies a persisted `LogEntry`'s `id`, `input`, `ok`, `message` field
 * types.
 */
function isLogEntry(value: unknown): value is LogEntry {
    if (!isRecord(value)) return false;
    return (
        typeof value.id === "number" &&
        typeof value.input === "string" &&
        typeof value.ok === "boolean" &&
        typeof value.message === "string"
    );
}

/**
 * Validates a parsed JSON value as a full `Architecture`: `nodes`/`edges`
 * arrays with every entry passing its structural check. Gates whether
 * storage-read data is trusted or rejected as corrupt.
 */
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
 * Parses raw JSON into a `PersistedState`, validating every field; returns
 * null on mismatch. Migrates sessions saved before `stepIndex`/`speedIndex`
 * existed by defaulting step to 0 and speed to default.
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
 * Reads and parses persisted state from storage, used to restore the last
 * session on load. Returns null for a missing entry, unreadable storage, or
 * invalid JSON - callers treat all failures alike: start fresh.
 * @param storage - real or `StorageLike` test double
 * @returns parsed state, or null if none found
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
 * Writes state to storage as JSON under this app's key; called on every
 * persisted-state change so a session survives a refresh. Failures are
 * caught, not thrown - persistence is a convenience, not something command
 * success depends on.
 * @param storage - backend to write to
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
 * Removes persisted state from storage, e.g. on an explicit reset. Failures
 * are caught and reported via the return value, not thrown.
 * @param storage - backend to clear
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
 * Outcome of interpreting a browser `storage` event for this app's key, as
 * a discriminated union tagged by `type`. `irrelevant`: different key.
 * `cleared`: another tab removed the session. `invalid`: new value failed
 * to parse as `PersistedState`. `updated`: carries the freshly parsed state
 * to adopt.
 */
export type PersistedStateChange =
    | { type: "irrelevant" }
    | { type: "cleared" }
    | { type: "invalid" }
    | { type: "updated"; state: PersistedState };

/**
 * Classifies a browser `window` `storage` event so another open tab can
 * react to a change made elsewhere. Storage events carry only a key and
 * raw value, so this re-parses and re-validates it like `loadPersistedState`
 * does.
 * @param key - the event's storage key (may be null for some browser clears)
 * @param newValue - raw new value, or null if removed
 * @returns a tagged description of what changed
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

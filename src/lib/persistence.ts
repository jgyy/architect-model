import { DEFAULT_SPEED_INDEX } from "@/lib/simulation";
import type {
    Architecture,
    ArchitectureEdge,
    ArchitectureNode,
} from "@/types/architecture";

export type LogEntry = {
    id: number;
    input: string;
    ok: boolean;
    message: string;
};

export type PersistedState = {
    architecture: Architecture;
    log: LogEntry[];
    stepIndex: number;
    speedIndex: number;
};

export type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;

const STORAGE_KEY = "architect-model:session";

function isRecord(value: unknown): value is Record<string, unknown> {
    return !!value && typeof value === "object";
}

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

function isArchitectureEdge(value: unknown): value is ArchitectureEdge {
    if (!isRecord(value)) return false;
    return (
        typeof value.id === "string" &&
        typeof value.source === "string" &&
        typeof value.target === "string"
    );
}

function isLogEntry(value: unknown): value is LogEntry {
    if (!isRecord(value)) return false;
    return (
        typeof value.id === "number" &&
        typeof value.input === "string" &&
        typeof value.ok === "boolean" &&
        typeof value.message === "string"
    );
}

export function isValidArchitecture(value: unknown): value is Architecture {
    return (
        isRecord(value) &&
        Array.isArray(value.nodes) &&
        value.nodes.every(isArchitectureNode) &&
        Array.isArray(value.edges) &&
        value.edges.every(isArchitectureEdge)
    );
}

// Sessions saved before stepIndex/speedIndex existed
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

// Returns whether the write actually succeeded (e.g. false on a quota
// error or Safari private-browsing's SecurityError), so a caller can warn
// the user instead of assuming a silently-swallowed failure means success.
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

export function clearPersistedState(storage: StorageLike): boolean {
    try {
        storage.removeItem(STORAGE_KEY);
        return true;
    } catch {
        return false;
    }
}

export type PersistedStateChange =
    | { type: "irrelevant" }
    | { type: "cleared" }
    | { type: "invalid" }
    | { type: "updated"; state: PersistedState };

// Classifies a `window` `storage` event so another tab can react
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

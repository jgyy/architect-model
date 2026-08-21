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
        typeof data.label === "string"
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

function isPersistedState(value: unknown): value is PersistedState {
    if (!isRecord(value)) return false;
    const architecture = value.architecture;
    return (
        isRecord(architecture) &&
        Array.isArray(architecture.nodes) &&
        architecture.nodes.every(isArchitectureNode) &&
        Array.isArray(architecture.edges) &&
        architecture.edges.every(isArchitectureEdge) &&
        Array.isArray(value.log) &&
        value.log.every(isLogEntry)
    );
}

export function loadPersistedState(
    storage: StorageLike,
): PersistedState | null {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return null;
    try {
        const parsed = JSON.parse(raw);
        return isPersistedState(parsed) ? parsed : null;
    } catch {
        return null;
    }
}

export function savePersistedState(
    storage: StorageLike,
    state: PersistedState,
): void {
    storage.setItem(STORAGE_KEY, JSON.stringify(state));
}

export function clearPersistedState(storage: StorageLike): void {
    storage.removeItem(STORAGE_KEY);
}

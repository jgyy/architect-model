import type { Architecture } from "@/types/architecture";

// One past (or future) state, paired with the command text that produced
export type HistoryEntry = {
    command: string;
    snapshot: Architecture;
};

export type UndoRedoState = {
    undoStack: HistoryEntry[];
    redoStack: HistoryEntry[];
};

export const EMPTY_UNDO_REDO_STATE: UndoRedoState = {
    undoStack: [],
    redoStack: [],
};

// Bounds memory for a long session; each entry carries a full architecture
export const MAX_UNDO_HISTORY_ENTRIES = 500;

// Called after a command changes the architecture from `before`
export function recordCommand(
    state: UndoRedoState,
    command: string,
    before: Architecture,
): UndoRedoState {
    const undoStack = [...state.undoStack, { command, snapshot: before }];
    return {
        undoStack:
            undoStack.length > MAX_UNDO_HISTORY_ENTRIES
                ? undoStack.slice(undoStack.length - MAX_UNDO_HISTORY_ENTRIES)
                : undoStack,
        redoStack: [],
    };
}

export type UndoRedoResult =
    | {
          ok: true;
          architecture: Architecture;
          command: string;
          state: UndoRedoState;
      }
    | { ok: false };

export function undo(
    state: UndoRedoState,
    current: Architecture,
): UndoRedoResult {
    const last = state.undoStack.at(-1);
    if (!last) return { ok: false };
    return {
        ok: true,
        architecture: last.snapshot,
        command: last.command,
        state: {
            undoStack: state.undoStack.slice(0, -1),
            redoStack: [
                ...state.redoStack,
                { command: last.command, snapshot: current },
            ],
        },
    };
}

export function redo(
    state: UndoRedoState,
    current: Architecture,
): UndoRedoResult {
    const last = state.redoStack.at(-1);
    if (!last) return { ok: false };
    return {
        ok: true,
        architecture: last.snapshot,
        command: last.command,
        state: {
            undoStack: [
                ...state.undoStack,
                { command: last.command, snapshot: current },
            ],
            redoStack: state.redoStack.slice(0, -1),
        },
    };
}

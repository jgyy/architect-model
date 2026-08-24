import type { Architecture } from "@/types/architecture";

/** One undo/redo entry: snapshot paired with the command that produced it. */
export type HistoryEntry = {
    command: string;
    // The architecture state to restore if this entry is popped.
    snapshot: Architecture;
};

/**
 * Two-stack undo/redo record for one architecture's edit history. Distinct
 * from command-history.ts, which replays typed console text.
 */
export type UndoRedoState = {
    undoStack: HistoryEntry[];
    redoStack: HistoryEntry[];
};

/** Fresh workspace's undo/redo state: both stacks empty. */
export const EMPTY_UNDO_REDO_STATE: UndoRedoState = {
    undoStack: [],
    redoStack: [],
};

/**
 * Caps undo stack memory (each entry holds a full architecture);
 * `recordCommand` slices to the most recent entries like a ring buffer.
 */
export const MAX_UNDO_HISTORY_ENTRIES = 500;

/**
 * Pushes an undo entry for `before` and clears the redo stack (a new edit
 * invalidates any undone future).
 *
 * @param before - snapshot prior to `command`
 * @returns updated state, capped at {@link MAX_UNDO_HISTORY_ENTRIES}
 */
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

/**
 * Result of an undo/redo step as a discriminated union (not a thrown
 * error), forcing callers to check `ok` before use.
 */
export type UndoRedoResult =
    | {
          ok: true;
          architecture: Architecture;
          command: string;
          state: UndoRedoState;
      }
    | { ok: false };

/**
 * Pops the top undo entry and pushes an inverse entry (same command,
 * `current`) onto the redo stack.
 *
 * @returns `{ ok: false }` if the undo stack is empty
 */
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

/**
 * Pops the top redo entry and pushes an inverse entry (same command,
 * `current`) onto the undo stack.
 *
 * @returns `{ ok: false }` if the redo stack is empty
 */
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

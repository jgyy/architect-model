import type { Architecture } from "@/types/architecture";

/**
 * One undo/redo entry: an architecture snapshot paired with the command
 * that moved the app away from it. Same shape on both stacks: past state
 * on undo, future state on redo.
 */
export type HistoryEntry = {
    command: string;
    // The architecture state to restore if this entry is popped.
    snapshot: Architecture;
};

/**
 * Two-stack undo/redo record for one architecture's edit history: each
 * command pushes an entry onto `undoStack`; undo pops it onto `redoStack`
 * inverted, and redo reverses that. Tracks the architecture graph only -
 * unrelated to command-history.ts, which replays typed console text.
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
 * Bounds memory for a long session, since each entry carries a full
 * architecture. `recordCommand` enforces this by slicing the undo stack
 * to the most recent entries once exceeded, like a fixed-size ring
 * buffer.
 */
export const MAX_UNDO_HISTORY_ENTRIES = 500;

/**
 * Called after a command changes the architecture from `before`. Pushes an
 * undo entry and clears the redo stack, since a fresh edit invalidates any
 * undone future.
 *
 * @param state - undo/redo state
 * @param command - command text for the change
 * @param before - architecture snapshot prior to `command`
 * @returns updated state: `before` pushed onto the undo stack (capped at
 * {@link MAX_UNDO_HISTORY_ENTRIES}), redo cleared
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
 * Result of an undo or redo step, as a discriminated union rather than a
 * thrown error, forcing callers to check `ok` before use. `ok: true`
 * carries the architecture to switch to, the command undone/redone, and
 * the updated state; `ok: false` means the relevant stack was empty.
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
 * Reverts to the state before the last recorded command, if any. Pops
 * the top undo entry, returns its snapshot, and pushes an inverse entry
 * (same command, current architecture) onto the redo stack.
 *
 * @param state - undo/redo state
 * @param current - architecture now, saved onto the redo stack
 * @returns `{ ok: false }` if the undo stack is empty; otherwise the
 * restored architecture, undone command, and updated state
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
 * Re-applies the last undone command by restoring the snapshot atop the
 * redo stack. Pops that entry, returns its snapshot, and pushes an
 * inverse entry (same command, current architecture) onto the undo stack.
 *
 * @param state - undo/redo state
 * @param current - architecture now, saved onto the undo stack
 * @returns `{ ok: false }` if the redo stack is empty; otherwise the
 * restored architecture, redone command, and updated state
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

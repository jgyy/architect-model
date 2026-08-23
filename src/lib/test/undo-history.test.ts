import { describe, expect, test } from "vitest";

import {
    EMPTY_UNDO_REDO_STATE,
    MAX_UNDO_HISTORY_ENTRIES,
    recordCommand,
    redo,
    undo,
    type UndoRedoState,
} from "@/lib/undo-history";
import type { Architecture } from "@/types/architecture";

function arch(label: string): Architecture {
    return {
        nodes: [{ id: "n1", position: { x: 0, y: 0 }, data: { label } }],
        edges: [],
    };
}

describe("recordCommand", () => {
    test("pushes the pre-command snapshot onto the undo stack", () => {
        const before = arch("before");
        const state = recordCommand(
            EMPTY_UNDO_REDO_STATE,
            "add node X",
            before,
        );
        expect(state.undoStack).toEqual([
            { command: "add node X", snapshot: before },
        ]);
    });

    test("clears the redo stack, since a new command invalidates it", () => {
        const seeded: UndoRedoState = {
            undoStack: [],
            redoStack: [{ command: "old redo", snapshot: arch("stale") }],
        };
        const state = recordCommand(seeded, "add node X", arch("before"));
        expect(state.redoStack).toEqual([]);
    });

    test("evicts the oldest entry once the cap is exceeded", () => {
        let state = EMPTY_UNDO_REDO_STATE;
        for (let i = 0; i < MAX_UNDO_HISTORY_ENTRIES + 1; i++) {
            state = recordCommand(state, `command ${i}`, arch(`state ${i}`));
        }
        expect(state.undoStack).toHaveLength(MAX_UNDO_HISTORY_ENTRIES);
        expect(state.undoStack[0]?.command).toBe("command 1");
        expect(state.undoStack.at(-1)?.command).toBe(
            `command ${MAX_UNDO_HISTORY_ENTRIES}`,
        );
    });
});

describe("undo", () => {
    test("is a no-op when the undo stack is empty", () => {
        const result = undo(EMPTY_UNDO_REDO_STATE, arch("current"));
        expect(result).toEqual({ ok: false });
    });

    test("restores the previous snapshot and reports the undone command", () => {
        const before = arch("before");
        const state = recordCommand(
            EMPTY_UNDO_REDO_STATE,
            "add node X",
            before,
        );
        const result = undo(state, arch("after"));
        expect(result).toEqual({
            ok: true,
            architecture: before,
            command: "add node X",
            state: {
                undoStack: [],
                redoStack: [{ command: "add node X", snapshot: arch("after") }],
            },
        });
    });
});

describe("redo", () => {
    test("is a no-op when the redo stack is empty", () => {
        const result = redo(EMPTY_UNDO_REDO_STATE, arch("current"));
        expect(result).toEqual({ ok: false });
    });

    test("restores the redone snapshot and reports the redone command", () => {
        const before = arch("before");
        const after = arch("after");
        const recorded = recordCommand(
            EMPTY_UNDO_REDO_STATE,
            "add node X",
            before,
        );
        const undone = undo(recorded, after);
        if (!undone.ok) throw new Error("expected undo to succeed");
        const result = redo(undone.state, undone.architecture);
        expect(result).toEqual({
            ok: true,
            architecture: after,
            command: "add node X",
            state: {
                undoStack: [{ command: "add node X", snapshot: before }],
                redoStack: [],
            },
        });
    });
});

describe("undo/redo round trip", () => {
    test("undo followed by redo returns exactly to the pre-undo architecture", () => {
        const before = arch("before");
        const after = arch("after");
        const recorded = recordCommand(
            EMPTY_UNDO_REDO_STATE,
            "add node X",
            before,
        );
        const undone = undo(recorded, after);
        if (!undone.ok) throw new Error("expected undo to succeed");
        const redone = redo(undone.state, undone.architecture);
        if (!redone.ok) throw new Error("expected redo to succeed");
        expect(redone.architecture).toEqual(after);
        expect(redone.state).toEqual(recorded);
    });

    test("recording a new command after an undo clears the redo branch", () => {
        const before = arch("before");
        const after = arch("after");
        const recorded = recordCommand(
            EMPTY_UNDO_REDO_STATE,
            "add node X",
            before,
        );
        const undone = undo(recorded, after);
        if (!undone.ok) throw new Error("expected undo to succeed");
        const state = recordCommand(
            undone.state,
            "add node Y",
            undone.architecture,
        );
        expect(state.redoStack).toEqual([]);
    });
});

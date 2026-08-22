import { describe, expect, test } from "vitest";

import {
    recallNewerCommand,
    recallOlderCommand,
    type CommandHistoryState,
} from "@/lib/command-history";

const IDLE: CommandHistoryState = { index: null, draft: "" };

describe("recallOlderCommand", () => {
    test("is a no-op with an empty command list", () => {
        const result = recallOlderCommand([], IDLE, "typing...");
        expect(result).toEqual({ state: IDLE, value: "typing..." });
    });

    test("recalls the most recent command on the first press", () => {
        const result = recallOlderCommand(
            ["add node A", "add node B"],
            IDLE,
            "",
        );
        expect(result.value).toBe("add node B");
        expect(result.state.index).toBe(0);
    });

    test("captures the in-progress draft on the first press", () => {
        const result = recallOlderCommand(["add node A"], IDLE, "unsent draft");
        expect(result.state.draft).toBe("unsent draft");
    });

    test("steps to the next-older command on a second press", () => {
        const first = recallOlderCommand(
            ["add node A", "add node B"],
            IDLE,
            "",
        );
        const second = recallOlderCommand(
            ["add node A", "add node B"],
            first.state,
            "add node B",
        );
        expect(second.value).toBe("add node A");
        expect(second.state.index).toBe(1);
    });

    test("clamps at the oldest command instead of wrapping around", () => {
        const first = recallOlderCommand(["only one"], IDLE, "");
        const second = recallOlderCommand(
            ["only one"],
            first.state,
            "only one",
        );
        expect(second.value).toBe("only one");
        expect(second.state.index).toBe(0);
    });

    test("does not overwrite an already-captured draft on later presses", () => {
        const first = recallOlderCommand(["a", "b"], IDLE, "my draft");
        const second = recallOlderCommand(["a", "b"], first.state, "b");
        expect(second.state.draft).toBe("my draft");
    });
});

describe("recallNewerCommand", () => {
    test("returns to the captured draft from the newest command", () => {
        const recalling: CommandHistoryState = { index: 0, draft: "my draft" };
        const result = recallNewerCommand(["a", "b"], recalling);
        expect(result.value).toBe("my draft");
        expect(result.state).toEqual(IDLE);
    });

    test("steps to the next-newer command", () => {
        const recalling: CommandHistoryState = { index: 1, draft: "my draft" };
        const result = recallNewerCommand(
            ["add node A", "add node B"],
            recalling,
        );
        expect(result.value).toBe("add node B");
        expect(result.state.index).toBe(0);
    });

    test("full round trip returns exactly to the original draft", () => {
        const commands = ["add node A", "add node B"];
        const older1 = recallOlderCommand(commands, IDLE, "my draft");
        const older2 = recallOlderCommand(commands, older1.state, older1.value);
        const newer1 = recallNewerCommand(commands, older2.state);
        const newer2 = recallNewerCommand(commands, newer1.state);
        expect(newer2.value).toBe("my draft");
        expect(newer2.state).toEqual(IDLE);
    });

    test("falls back to the draft instead of indexing out of bounds when the command list shrinks mid-recall", () => {
        const recalling: CommandHistoryState = { index: 2, draft: "my draft" };
        const result = recallNewerCommand(["only one left"], recalling);
        expect(result.value).toBe("only one left");
        expect(result.state.index).toBe(0);
    });

    test("falls back to the draft when the command list empties out mid-recall", () => {
        const recalling: CommandHistoryState = { index: 1, draft: "my draft" };
        const result = recallNewerCommand([], recalling);
        expect(result.value).toBe("my draft");
        expect(result.state).toEqual(IDLE);
    });
});

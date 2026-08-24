/**
 * State for shell-style Up/Down recall over submitted console commands,
 * like a terminal's history. Distinct from undo-history.ts's app-state
 * undo/redo, which reverses graph edits, not typed text.
 */
export type CommandHistoryState = {
    /** null = live editing; 0 = most recent command, 1 = one before it, ... */
    index: number | null;
    /** the in-progress input, captured when recall started, restored on the way back */
    draft: string;
};

/**
 * Advances recall into the past (Up-arrow). First press captures the
 * live input as the draft to restore later; further presses clamp at the
 * oldest command.
 *
 * @param commands - Submitted commands, oldest first.
 * @param state - Current recall state.
 * @param liveValue - Input box text; saved as the draft on fresh recall.
 * @returns Updated state and command text to show.
 */
export function recallOlderCommand(
    commands: string[],
    state: CommandHistoryState,
    liveValue: string,
): { state: CommandHistoryState; value: string } {
    if (commands.length === 0) return { state, value: liveValue };

    const index =
        state.index === null
            ? 0
            : Math.min(state.index + 1, commands.length - 1);
    const draft = state.index === null ? liveValue : state.draft;
    return {
        state: { index, draft },
        value: commands[commands.length - 1 - index],
    };
}

/**
 * Advances recall one step toward the present (Down-arrow). Stepping
 * past the newest command exits recall and restores the draft captured
 * when recall began.
 *
 * @param commands - Submitted commands, oldest first.
 * @param state - Current recall state.
 * @returns Updated state and command text to show.
 */
export function recallNewerCommand(
    commands: string[],
    state: CommandHistoryState,
): { state: CommandHistoryState; value: string } {
    if (state.index === null) return { state, value: state.draft };
    // commands may have shrunk (or emptied) since this recall started
    if (state.index === 0 || commands.length === 0) {
        return { state: { index: null, draft: "" }, value: state.draft };
    }
    const index = Math.min(state.index - 1, commands.length - 1);
    return {
        state: { index, draft: state.draft },
        value: commands[commands.length - 1 - index],
    };
}

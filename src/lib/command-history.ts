/** Up/Down recall state for console commands; distinct from undo-history.ts's undo/redo, which reverses graph edits, not typed text. */
export type CommandHistoryState = {
    /** null = live editing; 0 = most recent command, 1 = one before it, ... */
    index: number | null;
    /** the in-progress input, captured when recall started, restored on the way back */
    draft: string;
};

/**
 * Advances recall into the past (Up-arrow), clamping at the oldest command.
 * @param liveValue - saved as draft on fresh recall
 * @returns updated state and command text to show
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
 * Advances recall toward the present (Down-arrow); past the newest command, restores the draft and exits.
 * @returns updated state and command text to show
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

import type { LogEntry } from "@/lib/persistence";
import type { Architecture } from "@/types/architecture";

/**
 * Highest `id` used across `entries`, so `nextLogIdRef` can resume without
 * colliding with restored ids. Uses a plain loop rather than
 * `Math.max(...ids)` to avoid a stack overflow on a log near
 * {@link MAX_LOG_ENTRIES}.
 * @param entries - the log entries to scan
 * @returns the largest `id` found, or 0 if empty
 */
export function maxLogId(entries: LogEntry[]): number {
    let max = 0;
    for (const entry of entries) {
        if (entry.id > max) max = entry.id;
    }
    return max;
}

/**
 * Max entries the command log keeps at once, so console scrollback and the
 * autosaved JSON don't grow without limit.
 */
export const MAX_LOG_ENTRIES = 5000;

/**
 * Triggers a browser download of `json` as `filename`, used by the "export"
 * command. Uses a `Blob` plus a temporary, auto-clicked `<a download>` -
 * this app has no server to serve the export from.
 * @param json - file contents to download
 * @param filename - suggested filename for the save dialog
 */
export function downloadJsonFile(json: string, filename: string): void {
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
}

/**
 * Appends one entry to the log, trimming from the front once it exceeds
 * {@link MAX_LOG_ENTRIES}.
 * @param entries - the current log
 * @param entry - entry to append
 * @returns the updated, length-capped log
 */
export function appendLogEntry(
    entries: LogEntry[],
    entry: LogEntry,
): LogEntry[] {
    const next = [...entries, entry];
    return next.length > MAX_LOG_ENTRIES
        ? next.slice(next.length - MAX_LOG_ENTRIES)
        : next;
}

/**
 * Recomputes the step index so it still points at the same node after a
 * command changes the architecture (e.g. undo/redo, or a merge that inserts
 * nodes earlier in the trace). Falls back to `stepIndex` if that node no
 * longer exists in `after`.
 * @param before - architecture before the change
 * @param stepIndex - step index before the change
 * @param after - architecture after the change
 * @returns the index of the same node in `after`, or `stepIndex` if gone
 */
export function nextStepIndexForSameNode(
    before: Architecture,
    stepIndex: number,
    after: Architecture,
): number {
    const currentNodeId = before.nodes[stepIndex]?.id;
    if (!currentNodeId) return stepIndex;
    const newIndex = after.nodes.findIndex((node) => node.id === currentNodeId);
    return newIndex === -1 ? stepIndex : newIndex;
}

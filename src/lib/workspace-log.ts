import type { LogEntry } from "@/lib/persistence";
import type { Architecture } from "@/types/architecture";

/** Highest `id` in `entries`; loops (not `Math.max(...ids)`) to avoid stack overflow near {@link MAX_LOG_ENTRIES}.
 * @returns largest id, or 0 if empty
 */
export function maxLogId(entries: LogEntry[]): number {
    let max = 0;
    for (const entry of entries) {
        if (entry.id > max) max = entry.id;
    }
    return max;
}

/** Max entries kept in the command log, bounding scrollback and autosaved JSON size. */
export const MAX_LOG_ENTRIES = 5000;

/** Downloads `json` as `filename` via a Blob + auto-clicked anchor (no server to serve it from).
 * @param json - file contents
 * @param filename - suggested filename
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

/** Appends `entry`, trimming from the front past {@link MAX_LOG_ENTRIES}.
 * @returns updated, capped log
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

/** Reindexes `stepIndex` to the same node after an architecture change (undo/redo, merge); falls back to `stepIndex` if that node is gone.
 * @param before - prior architecture
 * @param stepIndex - prior index
 * @param after - new architecture
 * @returns index of same node in `after`, or `stepIndex`
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

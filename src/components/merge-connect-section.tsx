import type { AddedConnectEdge, ConnectOrigin } from "@/lib/architecture-io";

/**
 * Props for {@link MergeConnectSection}: the from/to option sets, current
 * selections, added-connection list, and the handlers that mutate them.
 */
type MergeConnectSectionProps = {
    /** Imported file's name; used as the incoming optgroup's label. */
    fileName: string;
    /** Connect option keys (`current:<id>`/`incoming:<id>`) eligible as a source. */
    sourceOptionIds: string[];
    /** Connect option keys eligible as a target for `effectiveSource`. */
    targetOptionIds: string[];
    /** The From select's actual value, already fallen back to a valid option. */
    effectiveSource: string;
    /** The To select's actual value, already fallen back to a valid option. */
    effectiveTarget: string;
    onSourceChange: (value: string) => void;
    onTargetChange: (value: string) => void;
    /** Whether both a source and target are currently chosen. */
    canAddConnection: boolean;
    onAddConnection: () => void;
    /** Connections drawn between the two architectures via Connect. */
    addedEdges: AddedConnectEdge[];
    onRemoveConnection: (source: string, target: string) => void;
    /** Resolves a connect option key to its label, falling back to the raw id. */
    labelForKey: (key: string) => string;
    /** Filters connect option keys to one merge side, for the optgroup split. */
    optionsByOrigin: (ids: string[], origin: ConnectOrigin) => string[];
};

/**
 * The merge picker's "Connect" block: From/To selects (each grouped into
 * "Existing architecture" and the incoming file's optgroups), an add
 * button, and the list of connections drawn so far.
 */
export function MergeConnectSection({
    fileName,
    sourceOptionIds,
    targetOptionIds,
    effectiveSource,
    effectiveTarget,
    onSourceChange,
    onTargetChange,
    canAddConnection,
    onAddConnection,
    addedEdges,
    onRemoveConnection,
    labelForKey,
    optionsByOrigin,
}: MergeConnectSectionProps) {
    /**
     * Renders one connect `<select>` (source or target), grouped into
     * "Existing architecture" and `fileName` optgroups. Shared by the
     * Connect from/to selects.
     * @param ariaLabel - accessible label.
     * @param value - selected connect option key.
     * @param onChange - called with the new key.
     * @param optionIds - connect option keys to offer.
     * @returns the select element.
     */
    function renderConnectSelect(
        ariaLabel: string,
        value: string,
        onChange: (value: string) => void,
        optionIds: string[],
    ) {
        return (
            <select
                aria-label={ariaLabel}
                value={value}
                onChange={(event) => onChange(event.target.value)}
                className="min-w-0 flex-1 rounded-md border border-border bg-background px-1.5 py-1 text-xs text-foreground"
            >
                {optionsByOrigin(optionIds, "current").length > 0 && (
                    <optgroup label="Existing architecture">
                        {optionsByOrigin(optionIds, "current").map((key) => (
                            <option key={key} value={key}>
                                {labelForKey(key)}
                            </option>
                        ))}
                    </optgroup>
                )}
                {optionsByOrigin(optionIds, "incoming").length > 0 && (
                    <optgroup label={fileName}>
                        {optionsByOrigin(optionIds, "incoming").map((key) => (
                            <option key={key} value={key}>
                                {labelForKey(key)}
                            </option>
                        ))}
                    </optgroup>
                )}
            </select>
        );
    }

    return (
        <div className="space-y-2 border-t border-border pt-2">
            <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                Connect
            </span>
            <div className="flex items-center gap-1.5">
                {renderConnectSelect(
                    "Connect from",
                    effectiveSource,
                    onSourceChange,
                    sourceOptionIds,
                )}
                <span aria-hidden className="text-muted-foreground">
                    →
                </span>
                {renderConnectSelect(
                    "Connect to",
                    effectiveTarget,
                    onTargetChange,
                    targetOptionIds,
                )}
                <button
                    type="button"
                    disabled={!canAddConnection}
                    onClick={onAddConnection}
                    className="rounded-full border border-border px-2.5 py-1 text-xs whitespace-nowrap hover:border-accent/60 hover:text-accent disabled:pointer-events-none disabled:opacity-40"
                >
                    Add connection
                </button>
            </div>
            {addedEdges.length > 0 && (
                <ul className="space-y-1">
                    {addedEdges.map((added) => {
                        const fromLabel = labelForKey(added.source);
                        const toLabel = labelForKey(added.target);
                        return (
                            <li
                                key={`${added.source}-${added.target}`}
                                className="flex items-center justify-between gap-2 text-foreground"
                            >
                                <span>
                                    {fromLabel} → {toLabel}
                                </span>
                                <button
                                    type="button"
                                    aria-label={`Remove connection: ${fromLabel} to ${toLabel}`}
                                    onClick={() =>
                                        onRemoveConnection(
                                            added.source,
                                            added.target,
                                        )
                                    }
                                    className="text-muted-foreground hover:text-foreground"
                                >
                                    ×
                                </button>
                            </li>
                        );
                    })}
                </ul>
            )}
        </div>
    );
}

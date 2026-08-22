"use client";

import { Panel } from "@xyflow/react";
import { HelpCircle, X } from "lucide-react";
import { useState } from "react";

type GuideTip = { title: string; description: string };

const TIPS: GuideTip[] = [
    { title: "Pan", description: "Drag empty canvas space to move around." },
    { title: "Zoom", description: "Scroll, pinch, or use the +/− controls." },
    { title: "Add a node", description: "Double-click empty canvas space." },
    {
        title: "Connect nodes",
        description:
            "Drag from the dot on a node's right edge to another node's left edge.",
    },
    { title: "Rename a node", description: "Double-click its label." },
    {
        title: "Delete",
        description: "Hover a node or edge, then click its red × button.",
    },
    {
        title: "Simulate",
        description:
            "Step through the Simulation panel - blue is the current node, red is one already crossed.",
    },
    {
        title: "Console",
        description: 'Type commands (try "help") in the panel on the right.',
    },
];

// Floating "?" overlay explaining how to navigate the React Flow canvas.
export function DiagramGuide() {
    const [open, setOpen] = useState(false);

    return (
        <Panel position="top-right" className="flex flex-col items-end gap-2">
            <button
                type="button"
                onClick={() => setOpen((current) => !current)}
                title="Diagram navigation guide"
                aria-expanded={open}
                aria-controls="diagram-guide-panel"
                className="flex h-8 w-8 items-center justify-center rounded-full border border-border bg-chrome text-foreground shadow-sm hover:bg-border/40"
            >
                <HelpCircle size={16} />
            </button>
            {open && (
                <div
                    id="diagram-guide-panel"
                    role="region"
                    aria-label="Diagram navigation guide"
                    className="w-72 max-w-[80vw] rounded-lg border border-border bg-chrome p-3 text-sm text-chrome-foreground shadow-md"
                >
                    <div className="mb-2 flex items-center justify-between">
                        <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                            Navigating the diagram
                        </span>
                        <button
                            type="button"
                            onClick={() => setOpen(false)}
                            title="Close guide"
                            className="rounded p-0.5 text-muted-foreground hover:bg-border hover:text-foreground"
                        >
                            <X size={14} />
                        </button>
                    </div>
                    <ul className="flex flex-col gap-1.5">
                        {TIPS.map((tip) => (
                            <li key={tip.title}>
                                <span className="font-medium text-foreground">
                                    {tip.title}:
                                </span>{" "}
                                <span className="text-muted-foreground">
                                    {tip.description}
                                </span>
                            </li>
                        ))}
                    </ul>
                </div>
            )}
        </Panel>
    );
}

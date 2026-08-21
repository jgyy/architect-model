"use client";

import { useCallback, useEffect, useRef } from "react";
import {
    Background,
    Controls,
    MiniMap,
    ReactFlow,
    useReactFlow,
    type NodeChange,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import { applyPersistableNodeChanges } from "@/lib/node-changes";
import type { Architecture, ArchitectureNode } from "@/types/architecture";

type ArchitectureCanvasProps = {
    architecture: Architecture;
    highlightedNodeId?: string;
    onNodesChange: (nodes: ArchitectureNode[]) => void;
};

const HIGHLIGHT_STYLE = {
    border: "2px solid #f59e0b",
    boxShadow: "0 0 0 4px rgba(245, 158, 11, 0.25)",
};

// The `fitView` prop on <ReactFlow> only runs once, on mount
function FitViewOnNodesChange({ nodeIds }: { nodeIds: string }) {
    const { fitView } = useReactFlow();
    const isFirstRun = useRef(true);

    useEffect(() => {
        if (isFirstRun.current) {
            isFirstRun.current = false;
            return;
        }
        fitView({ duration: 300 });
    }, [nodeIds, fitView]);

    return null;
}

export function ArchitectureCanvas({
    architecture,
    highlightedNodeId,
    onNodesChange,
}: ArchitectureCanvasProps) {
    const nodes = highlightedNodeId
        ? architecture.nodes.map((node) =>
            node.id === highlightedNodeId
                ? { ...node, style: { ...node.style, ...HIGHLIGHT_STYLE } }
                : node,
        )
        : architecture.nodes;

    const nodeIds = architecture.nodes.map((node) => node.id).join(",");

    // Apply against the un-highlighted `architecture.nodes`
    const handleNodesChange = useCallback(
        (changes: NodeChange<ArchitectureNode>[]) => {
            onNodesChange(
                applyPersistableNodeChanges(changes, architecture.nodes),
            );
        },
        [architecture.nodes, onNodesChange],
    );

    return (
        <ReactFlow
            nodes={nodes}
            edges={architecture.edges}
            onNodesChange={handleNodesChange}
            deleteKeyCode={null}
            fitView
        >
            <Background />
            <Controls />
            <MiniMap />
            <FitViewOnNodesChange nodeIds={nodeIds} />
        </ReactFlow>
    );
}

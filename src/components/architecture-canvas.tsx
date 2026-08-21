"use client";

import { useEffect, useRef } from "react";
import {
    Background,
    Controls,
    MiniMap,
    ReactFlow,
    useReactFlow,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import type { Architecture } from "@/types/architecture";

type ArchitectureCanvasProps = {
    architecture: Architecture;
    highlightedNodeId?: string;
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
}: ArchitectureCanvasProps) {
    const nodes = highlightedNodeId
        ? architecture.nodes.map((node) =>
              node.id === highlightedNodeId
                  ? { ...node, style: { ...node.style, ...HIGHLIGHT_STYLE } }
                  : node,
          )
        : architecture.nodes;

    const nodeIds = architecture.nodes.map((node) => node.id).join(",");

    return (
        <ReactFlow nodes={nodes} edges={architecture.edges} fitView>
            <Background />
            <Controls />
            <MiniMap />
            <FitViewOnNodesChange nodeIds={nodeIds} />
        </ReactFlow>
    );
}

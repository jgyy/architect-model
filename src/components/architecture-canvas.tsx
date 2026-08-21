"use client";

import { Background, Controls, MiniMap, ReactFlow } from "@xyflow/react";
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

  return (
    <ReactFlow nodes={nodes} edges={architecture.edges} fitView>
      <Background />
      <Controls />
      <MiniMap />
    </ReactFlow>
  );
}

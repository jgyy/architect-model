"use client";

import { Background, Controls, MiniMap, ReactFlow } from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import type { Architecture } from "@/types/architecture";

type ArchitectureCanvasProps = {
  architecture: Architecture;
};

export function ArchitectureCanvas({ architecture }: ArchitectureCanvasProps) {
  return (
    <ReactFlow nodes={architecture.nodes} edges={architecture.edges} fitView>
      <Background />
      <Controls />
      <MiniMap />
    </ReactFlow>
  );
}

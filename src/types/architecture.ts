import type { Edge, Node } from "@xyflow/react";

export type ArchitectureNodeData = {
  label: string;
};

export type ArchitectureNode = Node<ArchitectureNodeData>;

export type ArchitectureEdge = Edge;

export type Architecture = {
  nodes: ArchitectureNode[];
  edges: ArchitectureEdge[];
};

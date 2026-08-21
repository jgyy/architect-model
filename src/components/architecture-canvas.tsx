"use client";

import {
    useCallback,
    useEffect,
    useRef,
    useState,
    type CSSProperties,
} from "react";
import {
    applyNodeChanges,
    Background,
    BackgroundVariant,
    Controls,
    MarkerType,
    MiniMap,
    ReactFlow,
    useReactFlow,
    type Connection,
    type NodeChange,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import {
    ArchitectureNode as ArchitectureNodeCard,
    HighlightedNodeContext,
} from "@/components/architecture-node";
import {
    applyPersistableNodeChanges,
    createEdgeFromConnection,
} from "@/lib/node-changes";
import type {
    Architecture,
    ArchitectureEdge,
    ArchitectureNode,
} from "@/types/architecture";

type ArchitectureCanvasProps = {
    architecture: Architecture;
    highlightedNodeId?: string;
    onNodesChange: (nodes: ArchitectureNode[]) => void;
    onEdgesChange: (edges: ArchitectureEdge[]) => void;
};

// Overrides React Flow's default theming to follow this app's own color
const REACT_FLOW_THEME_VARS: Record<string, string> = {
    "--xy-background-pattern-dots-color": "var(--border-strong)",
    "--xy-edge-stroke": "var(--border-strong)",
    "--xy-edge-stroke-selected": "var(--accent)",
    "--xy-connectionline-stroke": "var(--accent)",
    "--xy-connectionline-stroke-width": "2",
    "--xy-handle-background-color": "var(--accent)",
    "--xy-handle-border-color": "var(--accent)",
    "--xy-selection-background-color":
        "color-mix(in srgb, var(--accent) 8%, transparent)",
    "--xy-selection-border": "1px dotted var(--accent)",
    "--xy-controls-button-background-color": "var(--chrome)",
    "--xy-controls-button-background-color-hover": "var(--border)",
    "--xy-controls-button-border-color": "var(--border)",
    "--xy-controls-button-color": "var(--foreground)",
    "--xy-controls-box-shadow": "none",
    "--xy-minimap-background-color": "var(--chrome)",
    "--xy-minimap-mask-background-color":
        "color-mix(in srgb, var(--foreground) 8%, transparent)",
    "--xy-minimap-node-background-color": "var(--border-strong)",
};

const NODE_TYPES = { default: ArchitectureNodeCard };
const DEFAULT_EDGE_OPTIONS = {
    markerEnd: { type: MarkerType.ArrowClosed },
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
    onEdgesChange,
}: ArchitectureCanvasProps) {
    // https://react.dev/learn/you-might-not-need-an-effect
    const [renderNodes, setRenderNodes] = useState(architecture.nodes);
    const [syncedFrom, setSyncedFrom] = useState(architecture.nodes);
    if (architecture.nodes !== syncedFrom) {
        setSyncedFrom(architecture.nodes);
        setRenderNodes((current) => {
            const byId = new Map(current.map((node) => [node.id, node]));
            return architecture.nodes.map((node) => ({
                ...byId.get(node.id),
                ...node,
            }));
        });
    }

    const nodeIds = architecture.nodes.map((node) => node.id).join(",");

    const handleNodesChange = useCallback(
        (changes: NodeChange<ArchitectureNode>[]) => {
            setRenderNodes((current) => applyNodeChanges(changes, current));
            const nextNodes = applyPersistableNodeChanges(
                changes,
                architecture.nodes,
            );
            if (nextNodes !== architecture.nodes) onNodesChange(nextNodes);
        },
        [architecture.nodes, onNodesChange],
    );

    const handleConnect = useCallback(
        (connection: Connection) => {
            const edge = createEdgeFromConnection(connection, architecture);
            if (edge) onEdgesChange([...architecture.edges, edge]);
        },
        [architecture, onEdgesChange],
    );

    return (
        <HighlightedNodeContext.Provider value={highlightedNodeId}>
            <ReactFlow
                nodes={renderNodes}
                edges={architecture.edges}
                nodeTypes={NODE_TYPES}
                defaultEdgeOptions={DEFAULT_EDGE_OPTIONS}
                connectionLineStyle={{
                    stroke: "var(--accent)",
                    strokeWidth: 2,
                }}
                colorMode="system"
                style={REACT_FLOW_THEME_VARS as CSSProperties}
                onNodesChange={handleNodesChange}
                onConnect={handleConnect}
                deleteKeyCode={null}
                fitView
            >
                <Background variant={BackgroundVariant.Dots} gap={20} />
                <Controls />
                <MiniMap pannable zoomable />
                <FitViewOnNodesChange nodeIds={nodeIds} />
            </ReactFlow>
        </HighlightedNodeContext.Provider>
    );
}

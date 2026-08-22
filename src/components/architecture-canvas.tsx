"use client";

import {
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState,
    type CSSProperties,
    type MouseEvent as ReactMouseEvent,
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
    type ReactFlowInstance,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import {
    ArchitectureEdge as ArchitectureEdgeCard,
    EdgeDeleteContext,
} from "@/components/architecture-edge";
import {
    ArchitectureNode as ArchitectureNodeCard,
    HighlightedNodeContext,
    NodeActionsContext,
    type NodeActions,
} from "@/components/architecture-node";
import { isDoubleClick, type ClickPoint } from "@/lib/canvas-commands";
import { applyPersistableNodeChanges } from "@/lib/node-changes";
import type {
    Architecture,
    ArchitectureEdge,
    ArchitectureNode,
} from "@/types/architecture";

type ArchitectureCanvasProps = {
    architecture: Architecture;
    highlightedNodeId?: string;
    traversedNodeIds?: Set<string>;
    traversedEdgeIds?: Set<string>;
    onNodesChange: (nodes: ArchitectureNode[]) => void;
    onNodeCreate: (position: { x: number; y: number }) => string | null;
    onNodeRename: (nodeId: string, newLabel: string) => void;
    onNodeDelete: (nodeId: string) => void;
    onEdgeCreate: (sourceId: string, targetId: string) => void;
    onEdgeDelete: (edgeId: string) => void;
};

const EMPTY_ID_SET = new Set<string>();
const TRAVERSED_EDGE_STYLE = { stroke: "var(--danger)", strokeWidth: 2.5 };
const TRAVERSED_EDGE_MARKER = {
    type: MarkerType.ArrowClosed,
    color: "var(--danger)",
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
const EDGE_TYPES = { default: ArchitectureEdgeCard };
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
    traversedNodeIds = EMPTY_ID_SET,
    traversedEdgeIds = EMPTY_ID_SET,
    onNodesChange,
    onNodeCreate,
    onNodeRename,
    onNodeDelete,
    onEdgeCreate,
    onEdgeDelete,
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
            onEdgeCreate(connection.source, connection.target);
        },
        [onEdgeCreate],
    );

    // Detects a double-click on the empty pane
    const reactFlowInstanceRef = useRef<ReactFlowInstance<
        ArchitectureNode,
        ArchitectureEdge
    > | null>(null);
    const lastPaneClickRef = useRef<ClickPoint | null>(null);
    const [autoEditNodeId, setAutoEditNodeId] = useState<string | null>(null);

    const handlePaneClick = useCallback(
        (event: ReactMouseEvent) => {
            const current: ClickPoint = {
                x: event.clientX,
                y: event.clientY,
                time: Date.now(),
            };
            const previous = lastPaneClickRef.current;
            if (!isDoubleClick(current, previous)) {
                lastPaneClickRef.current = current;
                return;
            }
            lastPaneClickRef.current = null;
            const position = reactFlowInstanceRef.current?.screenToFlowPosition(
                { x: current.x, y: current.y },
            );
            if (!position) return;
            setAutoEditNodeId(onNodeCreate(position));
        },
        [onNodeCreate],
    );

    const nodeActions = useMemo<NodeActions>(
        () => ({
            onRename: onNodeRename,
            onDelete: onNodeDelete,
            autoEditNodeId,
            onAutoEditConsumed: () => setAutoEditNodeId(null),
        }),
        [onNodeRename, onNodeDelete, autoEditNodeId],
    );

    const renderEdges = useMemo(
        () =>
            architecture.edges.map((edge) =>
                traversedEdgeIds.has(edge.id)
                    ? {
                          ...edge,
                          style: TRAVERSED_EDGE_STYLE,
                          markerEnd: TRAVERSED_EDGE_MARKER,
                      }
                    : edge,
            ),
        [architecture.edges, traversedEdgeIds],
    );

    const highlight = useMemo(
        () => ({ currentNodeId: highlightedNodeId, traversedNodeIds }),
        [highlightedNodeId, traversedNodeIds],
    );

    return (
        <HighlightedNodeContext.Provider value={highlight}>
            <NodeActionsContext.Provider value={nodeActions}>
                <EdgeDeleteContext.Provider value={onEdgeDelete}>
                    <ReactFlow
                        nodes={renderNodes}
                        edges={renderEdges}
                        nodeTypes={NODE_TYPES}
                        edgeTypes={EDGE_TYPES}
                        defaultEdgeOptions={DEFAULT_EDGE_OPTIONS}
                        connectionLineStyle={{
                            stroke: "var(--accent)",
                            strokeWidth: 2,
                        }}
                        colorMode="system"
                        style={REACT_FLOW_THEME_VARS as CSSProperties}
                        onInit={(instance) => {
                            reactFlowInstanceRef.current = instance;
                        }}
                        onNodesChange={handleNodesChange}
                        onConnect={handleConnect}
                        onPaneClick={handlePaneClick}
                        deleteKeyCode={null}
                        fitView
                    >
                        <Background variant={BackgroundVariant.Dots} gap={20} />
                        <Controls />
                        <MiniMap pannable zoomable />
                        <FitViewOnNodesChange nodeIds={nodeIds} />
                    </ReactFlow>
                </EdgeDeleteContext.Provider>
            </NodeActionsContext.Provider>
        </HighlightedNodeContext.Provider>
    );
}

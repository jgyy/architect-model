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
    Panel,
    ReactFlow,
    useReactFlow,
    type Connection,
    type NodeChange,
    type ReactFlowInstance,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { Plus } from "lucide-react";

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
import { DiagramGuide } from "@/components/diagram-guide";
import { isDoubleClick, type ClickPoint } from "@/lib/canvas-commands";
import { applyPersistableNodeChanges } from "@/lib/node-changes";
import type {
    Architecture,
    ArchitectureEdge,
    ArchitectureNode,
} from "@/types/architecture";

/**
 * Props for {@link ArchitectureCanvas}: the architecture graph to draw, the
 * simulation trace's current position (node/edges highlighted during playback),
 * and the callbacks used to report user edits up to the state-owning parent.
 */
type ArchitectureCanvasProps = {
    architecture: Architecture;
    /** Id of the node the simulation trace is currently paused on, if any. */
    highlightedNodeId?: string;
    /** Ids of nodes the simulation trace has already stepped through. */
    traversedNodeIds?: Set<string>;
    /** Ids of edges the simulation trace has already stepped through; drawn in a distinct style. */
    traversedEdgeIds?: Set<string>;
    onNodesChange: (nodes: ArchitectureNode[]) => void;
    /** Creates a node at `position`; returns its new id, or null if creation was rejected. */
    onNodeCreate: (position: { x: number; y: number }) => string | null;
    /** Renames a node; returns whether the rename was accepted. */
    onNodeRename: (nodeId: string, newLabel: string) => boolean;
    onNodeDelete: (nodeId: string) => void;
    onEdgeCreate: (sourceId: string, targetId: string) => void;
    onEdgeDelete: (edgeId: string) => void;
};

/**
 * Stable empty-Set default for unset `traversedNodeIds`/`traversedEdgeIds`, so
 * memoized values derived from them don't recompute every render.
 */
const EMPTY_ID_SET = new Set<string>();
/** Highlight styling applied to edges the simulation trace has already walked. */
const TRAVERSED_EDGE_STYLE = { stroke: "var(--danger)", strokeWidth: 2.5 };
const TRAVERSED_EDGE_MARKER = {
    type: MarkerType.ArrowClosed,
    color: "var(--danger)",
};

/**
 * CSS custom-property overrides fed to React Flow via inline style, mapping
 * background, edges, selection, controls, and minimap to this app's color tokens.
 */
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

/**
 * Reconciles live render state with the latest architecture data from the parent,
 * so local-only React Flow state on a node survives a re-render instead of being
 * clobbered by stale data. A node with an unchanged reference is reused as-is; the
 * mid-drag node keeps its local position; other nodes merge incoming data over
 * existing local-only fields.
 *
 * @param current - Current render nodes, possibly ahead of `incoming` (e.g. mid-drag).
 * @param incoming - Latest nodes from the parent's state.
 * @param draggingNodeId - Id of the dragged node, or null.
 * @returns Reconciled nodes to render.
 */
export function reconcileRenderNodes(
    current: ArchitectureNode[],
    incoming: ArchitectureNode[],
    draggingNodeId: string | null,
): ArchitectureNode[] {
    const byId = new Map(current.map((node) => [node.id, node]));
    return incoming.map((node) => {
        const existing = byId.get(node.id);
        if (existing === node) return node;
        if (existing && node.id === draggingNodeId) {
            return { ...existing, ...node, position: existing.position };
        }
        return { ...existing, ...node };
    });
}

/**
 * Registers this app's custom node/edge renderers under React Flow's "default"
 * type key, so the canvas uses this app's visuals instead of React Flow's built-in
 * rendering.
 */
const NODE_TYPES = { default: ArchitectureNodeCard };
const EDGE_TYPES = { default: ArchitectureEdgeCard };
const DEFAULT_EDGE_OPTIONS = {
    markerEnd: { type: MarkerType.ArrowClosed },
};
/**
 * Node-count threshold above which the minimap is hidden, since MiniMap's
 * per-mutation redraw cost dominates past this size. One of this file's two
 * deliberate perf fixes for large graphs.
 */
const MINIMAP_NODE_LIMIT = 300;

/**
 * Re-frames the view (`fitView`) when node ids change after mount, since
 * `<ReactFlow>`'s `fitView` prop only runs once on mount. Debounced with delay
 * reset on each change, so rapid mutations collapse into one re-frame - the
 * file's other deliberate perf fix for large graphs. Renders no UI.
 *
 * @param nodeIds - Comma-joined node ids; a change-detection key to retrigger the effect.
 */
function FitViewOnNodesChange({ nodeIds }: { nodeIds: string }) {
    const { fitView } = useReactFlow();
    const isFirstRun = useRef(true);

    useEffect(() => {
        if (isFirstRun.current) {
            isFirstRun.current = false;
            return;
        }
        // Coalesces a burst of rapid mutations
        const timer = setTimeout(() => fitView({ duration: 300 }), 300);
        return () => clearTimeout(timer);
    }, [nodeIds, fitView]);

    return null;
}

/**
 * Renders the interactive architecture diagram: a React Flow canvas showing the
 * graph, highlighting the simulation trace's path, and translating canvas gestures
 * into the callbacks a typed command triggers. Owns render-state reconciliation
 * ({@link reconcileRenderNodes}) and two large-graph perf guards: minimap hidden
 * past {@link MINIMAP_NODE_LIMIT} nodes, debounced re-framing via
 * {@link FitViewOnNodesChange}.
 *
 * @param props - See {@link ArchitectureCanvasProps}.
 */
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
    // Id of the node currently mid-drag, if any - see reconcileRenderNodes.
    const draggingNodeIdRef = useRef<string | null>(null);
    if (architecture.nodes !== syncedFrom) {
        setSyncedFrom(architecture.nodes);
        setRenderNodes((current) =>
            reconcileRenderNodes(
                current,
                architecture.nodes,
                draggingNodeIdRef.current,
            ),
        );
    }

    const nodeIds = useMemo(
        () => architecture.nodes.map((node) => node.id).join(","),
        [architecture.nodes],
    );

    const handleNodesChange = useCallback(
        (changes: NodeChange<ArchitectureNode>[]) => {
            const positionChange = changes.find(
                (change) => change.type === "position",
            );
            if (positionChange) {
                draggingNodeIdRef.current = positionChange.dragging
                    ? positionChange.id
                    : null;
            }
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
    const canvasWrapperRef = useRef<HTMLDivElement>(null);
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

    // Touch/keyboard-reachable equivalent of double-clicking the pane
    const handleAddNodeClick = useCallback(() => {
        const instance = reactFlowInstanceRef.current;
        const rect = canvasWrapperRef.current?.getBoundingClientRect();
        if (!instance || !rect) return;
        const position = instance.screenToFlowPosition({
            x: rect.left + rect.width / 2,
            y: rect.top + rect.height / 2,
        });
        setAutoEditNodeId(onNodeCreate(position));
    }, [onNodeCreate]);

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
                    <div ref={canvasWrapperRef} className="h-full w-full">
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
                            onlyRenderVisibleElements
                        >
                            <Background
                                variant={BackgroundVariant.Dots}
                                gap={20}
                            />
                            <Controls />
                            {/* The minimap redraws every node's position */}
                            {architecture.nodes.length <=
                                MINIMAP_NODE_LIMIT && (
                                <MiniMap pannable zoomable />
                            )}
                            <Panel
                                position="top-left"
                                className="flex items-center gap-2"
                            >
                                <span className="flex h-8 items-center rounded-full border border-border bg-chrome px-3 text-xs font-medium tracking-wide text-muted-foreground uppercase">
                                    2 · Architecture
                                </span>
                                <button
                                    type="button"
                                    onClick={handleAddNodeClick}
                                    title="Add node"
                                    className="flex h-8 items-center gap-1.5 rounded-full border border-border bg-chrome px-3 text-xs font-medium text-foreground shadow-sm hover:bg-border/40"
                                >
                                    <Plus size={14} />
                                    Add node
                                </button>
                            </Panel>
                            <DiagramGuide />
                            <FitViewOnNodesChange nodeIds={nodeIds} />
                        </ReactFlow>
                    </div>
                </EdgeDeleteContext.Provider>
            </NodeActionsContext.Provider>
        </HighlightedNodeContext.Provider>
    );
}

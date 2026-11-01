"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  LiveblocksProvider,
  RoomProvider,
  useEventListener,
  useHistory,
  useRoom,
  useSelf,
} from "@liveblocks/react";
import {
  ClientSideSuspense,
  useErrorListener,
  useMutableStorage,
  useUpdateMyPresence,
} from "@liveblocks/react/suspense";
import { useLiveblocksFlow } from "@liveblocks/react-flow";
import {
  Background,
  BackgroundVariant,
  ConnectionLineType,
  ConnectionMode,
  MiniMap,
  ReactFlow,
  getNodesBounds,
  getViewportForBounds,
  type EdgeChange,
  type NodeChange,
  type ReactFlowInstance,
  useNodes,
  useNodesInitialized,
  ReactFlowProvider,
  useReactFlow,
} from "@xyflow/react";

import {
  CanvasServicesProvider,
  useCanvasServices,
  type CanvasServices,
} from "@/components/editor/canvas-context";
import { canvasNodeTypes, ShapeDragPreview } from "@/components/editor/canvas-node";
import { CanvasPresence } from "@/components/editor/canvas-presence";
import {
  CanvasEdgeArrowMarker,
  canvasEdgeTypes,
} from "@/components/editor/canvas-edge";
import { CanvasControls } from "@/components/editor/canvas-controls";
import { ShapePanel } from "@/components/editor/shape-panel";
import {
  cloneTemplate,
  withRemappedIds,
  type CanvasImportRequest,
} from "@/components/editor/starter-templates";
import {
  DEFAULT_NODE_COLOR,
  SHAPE_DRAG_MIME,
  SHAPE_SIZES,
  parseShapeDragPayload,
  type CanvasEdge,
  type CanvasNode,
  type CanvasNodeShape,
  type ShapeDragPayload,
} from "@/types/canvas";

interface LiveCanvasProps {
  roomId: string;
  /** A starter template selected for import; applied once, then acknowledged. */
  importRequest?: CanvasImportRequest | null;
  /** Called after the import request has been applied to the room. */
  onTemplateImported?: (requestId: string) => void;
  /** Called when an `ask` import hits a canvas that already has content. */
  onImportConflict?: (request: CanvasImportRequest) => void;
  /** The last acknowledged import, for the post-import fit. */
  appliedImport?: { requestId: string; nodeIds: string[] } | null;
  /**
   * Widths (px) of the sidebars that float over the canvas edges; the
   * zoom-fit treats them as unavailable work area.
   */
  fitInsets: { left: number; right: number };
}

type CanvasState = "ready" | "connection-error" | "access-revoked";
/** Below this much visible width the sidebars overlay too much to fit around. */
const MIN_FIT_AVAILABILITY_PX = 280;
/** Fixed screen-space allowance for routed paths beyond node bounds. */
const FIT_PADDING = "64px";
/** React Flow's default minimum zoom; the canvas never overrides it. */
const MIN_VIEWPORT_ZOOM = 0.5;
/** Gap between existing content and a template added beside it. */
const ADD_TEMPLATE_GAP = 120;

/**
 * Owns the Liveblocks connection for one authorized project room and renders
 * the collaborative React Flow canvas.
 *
 * @param props.roomId - The authorized project ID used as the Liveblocks room ID.
 * @param props.importRequest - A one-shot starter template import command.
 * @param props.onTemplateImported - Acknowledgement with the completed
 *   request ID so the parent can clear only that pending request.
 */
export function LiveCanvas({
  roomId,
  importRequest,
  onTemplateImported,
  onImportConflict,
  appliedImport,
  fitInsets,
}: LiveCanvasProps) {
  const [state, setState] = useState<CanvasState>("ready");
  const showConnectionError = useCallback(
    () => setState("connection-error"),
    [],
  );
  const showAccessRevoked = useCallback(() => setState("access-revoked"), []);

  return (
    <div className="h-full min-h-0 w-full bg-base">
      <LiveblocksProvider authEndpoint="/api/liveblocks-auth">
        {state === "connection-error" ? (
          <CanvasConnectionFallback />
        ) : state === "access-revoked" ? (
          <CanvasAccessRevokedFallback />
        ) : (
          <RoomProvider
          key={roomId}
          id={roomId}
          initialPresence={{ cursor: null, thinking: false }}
          >
            <RoomConnectionErrorListener
              onConnectionError={showConnectionError}
            />
            <RoomAccessRevocationListener onAccessRevoked={showAccessRevoked} />
            <ClientSideSuspense fallback={<CanvasLoading />}>
              {() => (
                <LiveFlowCanvas
                  importRequest={importRequest ?? null}
                  onTemplateImported={onTemplateImported ?? (() => {})}
                  onImportConflict={onImportConflict ?? (() => {})}
                  fitInsets={fitInsets}
                  appliedImport={appliedImport ?? null}
                />
              )}
            </ClientSideSuspense>
          </RoomProvider>
        )}
      </LiveblocksProvider>
    </div>
  );
}

interface RoomConnectionErrorListenerProps {
  onConnectionError: () => void;
}

function RoomConnectionErrorListener({
  onConnectionError,
}: RoomConnectionErrorListenerProps) {
  useErrorListener((error) => {
    if (error.context.type === "ROOM_CONNECTION_ERROR") {
      onConnectionError();
    }
  });

  return null;
}

interface RoomAccessRevocationListenerProps {
  onAccessRevoked: () => void;
}

function RoomAccessRevocationListener({
  onAccessRevoked,
}: RoomAccessRevocationListenerProps) {
  const room = useRoom();
  const self = useSelf();

  useEventListener(({ event, user, connectionId }) => {
    if (user !== null || connectionId !== -1) return;

    if (
      event.type === "access-revoked" &&
      event.userId === self?.id
    ) {
      // Stop reconnection immediately; the parent then unmounts RoomProvider.
      room.disconnect();
      onAccessRevoked();
    }
  });

  return null;
}

function HydratedFlowFit() {
  const nodes = useNodes<CanvasNode>();
  const nodesInitialized = useNodesInitialized();
  const hasFitted = useRef(false);
  const storage = useMutableStorage();
  const [initialRoomNodeIds] = useState<readonly string[]>(() => {
    const storedNodes = storage.get("flow")?.get("nodes");
    return storedNodes ? Array.from(storedNodes.keys()) : [];
  });
  const { viewportInitialized } = useReactFlow<CanvasNode, CanvasEdge>();
  const { fitVisibleArea } = useCanvasServices();

  useEffect(() => {
    if (
      !initialRoomNodeIds.length ||
      !initialRoomNodeIds.every((id) => nodes.some((node) => node.id === id)) ||
      !nodesInitialized ||
      !viewportInitialized ||
      hasFitted.current
    ) {
      return;
    }

    let disposed = false;
    queueMicrotask(() => {
      if (disposed || hasFitted.current) return;

      hasFitted.current = true;
      // Fit exactly the nodes that existed when this room was first read.
      // The service still applies the normal sidebar insets, padding, and
      // zoom limits; this third argument only narrows the bounds snapshot.
      fitVisibleArea(0, 1, initialRoomNodeIds);
    });

    return () => {
      disposed = true;
    };
  }, [
    fitVisibleArea,
    initialRoomNodeIds,
    nodes,
    nodesInitialized,
    viewportInitialized,
  ]);

  return null;
}

interface LiveFlowCanvasProps {
  importRequest: CanvasImportRequest | null;
  onTemplateImported: (requestId: string) => void;
  onImportConflict: (request: CanvasImportRequest) => void;
  fitInsets: { left: number; right: number };
  /** The last import the canvas acknowledged, for the post-import fit. */
  appliedImport: { requestId: string; nodeIds: string[] } | null;
}

/**
 * Applies a pending starter template import to the room, replacing the
 * current canvas: the existing nodes and edges are deleted first (in one
 * atomic mutation, so no collaborator ever sees a dangling edge), then the
 * template's nodes and edges are added. History is paused around the
 * replacement so the whole import reverts with a single undo.
 */
function useStarterTemplateImport({
  importRequest,
  onTemplateImported,
  onImportConflict,
}: Pick<
  LiveFlowCanvasProps,
  "importRequest" | "onTemplateImported" | "onImportConflict"
>) {
  const {
    nodes,
    edges,
    onNodesChange,
    onEdgesChange,
    onConnect,
    onDelete,
  } = useLiveblocksFlow<CanvasNode, CanvasEdge>({
    nodes: { initial: [] },
    edges: { initial: [] },
    suspense: true,
  });
  const history = useHistory();
  // The requestId of the last request actually applied; keeps a
  // double-invoked effect (React strict mode) from importing twice.
  const consumedRequestId = useRef<string | null>(null);

  useEffect(() => {
    if (!importRequest) return;
    if (consumedRequestId.current === importRequest.requestId) return;

    // Clone so React Flow / Liveblocks never hold a reference into the
    // static template module data.
    const template = cloneTemplate(importRequest.template);

    if (importRequest.mode === "ask" && nodes.length > 0) {
      // The canvas already has content: ask the user how to proceed. The
      // request stays unconsumed; the choice dialog answers with a new
      // request in an explicit mode (same template, fresh requestId).
      onImportConflict(importRequest);
      return;
    }

    // Resume in a finally: if a mutation throws, leaving history paused would
    // merge every future canvas edit into one undo entry.
    try {
      history.pause();
      if (importRequest.mode === "add") {
        // Keep the existing canvas: deterministic id remap (unique per
        // request) plus a shift of the whole diagram to the right of the
        // existing content's bounding box.
        const { nodes: remappedNodes, edges: remappedEdges } = withRemappedIds(
          importRequest.requestId,
          template,
        );
        const bounds = getNodesBounds(nodes);
        const offsetX = bounds
          ? bounds.x + bounds.width + ADD_TEMPLATE_GAP
          : 0;
        onNodesChange(
          remappedNodes.map((node) => ({
            type: "add" as const,
            item: {
              ...node,
              position: {
                ...node.position,
                x: node.position.x + offsetX,
              },
            },
          })),
        );
        onEdgesChange(
          remappedEdges.map((edge) => ({ type: "add" as const, item: edge })),
        );
      } else {
        // `replace` (or an `ask` that found an empty canvas): clear first,
        // in one atomic mutation, so no collaborator ever sees a dangling
        // edge.
        onDelete({ nodes, edges });
        onNodesChange(
          template.nodes.map((node) => ({ type: "add" as const, item: node })),
        );
        onEdgesChange(
          template.edges.map((edge) => ({ type: "add" as const, item: edge })),
        );
      }
    } finally {
      history.resume();
    }

    // Mark the request consumed only after every mutation succeeded, so a
    // failed attempt is not burned while the parent still holds it. The
    // parent acknowledges and derives the imported node ids itself (they
    // are deterministic per mode + requestId), which keeps this effect free
    // of local state writes.
    consumedRequestId.current = importRequest.requestId;
    onTemplateImported(importRequest.requestId);
  }, [
    importRequest,
    onTemplateImported,
    onImportConflict,
    nodes,
    edges,
    onNodesChange,
    onEdgesChange,
    onDelete,
    history,
  ]);

  return {
    nodes,
    edges,
    onNodesChange,
    onEdgesChange,
    onConnect,
    onDelete,
  };
}

/**
 * Fits the view to an imported template once all of its nodes are present in
 * the flow. Modeled on HydratedFlowFit: it waits for every imported node id,
 * then fits in a microtask after commit (by which point the custom nodes have
 * populated their measured dimensions). One fit per import request.
 */
function ImportedTemplateFit({
  importedNodes,
}: {
  /** The acknowledged import (request id + imported node ids) to fit. */
  importedNodes: { requestId: string; nodeIds: string[] } | null;
}) {
  const nodes = useNodes<CanvasNode>();
  const nodesInitialized = useNodesInitialized();
  const { viewportInitialized } = useReactFlow<CanvasNode, CanvasEdge>();
  const { fitVisibleArea } = useCanvasServices();
  const fittedRequestId = useRef<string | null>(null);

  useEffect(() => {
    if (!importedNodes) return;
    if (fittedRequestId.current === importedNodes.requestId) return;
    if (
      !importedNodes.nodeIds.every((id) =>
        nodes.some((node) => node.id === id),
      ) ||
      !nodesInitialized ||
      !viewportInitialized
    ) {
      return;
    }

    let disposed = false;
    queueMicrotask(() => {
      if (disposed || fittedRequestId.current === importedNodes.requestId)
        return;
      fittedRequestId.current = importedNodes.requestId;
      fitVisibleArea(300, 1);
    });

    return () => {
      disposed = true;
    };
  }, [
    fitVisibleArea,
    importedNodes,
    nodes,
    nodesInitialized,
    viewportInitialized,
  ]);

  return null;
}

/**
 * Build the canvas services value: the storage change handlers plus the
 * zoom-fit that respects the floating sidebars, and a screen-to-flow
 * converter for the node/edge renderers. Called from `LiveFlowCanvas` under
 * the explicit `ReactFlowProvider` that wraps the canvas, which is what
 * makes `useReactFlow` available there.
 *
 * The value is memoized so the context only invalidates when a sidebar
 * toggles (or the handlers change), not on every flow update — the live node
 * list is read through a ref at fit time instead.
 */
function useCanvasServicesValue({
  onNodesChange,
  onEdgesChange,
  fitInsets,
  reconnectActive,
  reconnectTargetNodeId,
  setReconnectActive,
  setReconnectTargetNodeId,
}: {
  onNodesChange: (changes: NodeChange<CanvasNode>[]) => void;
  onEdgesChange: (changes: EdgeChange<CanvasEdge>[]) => void;
  fitInsets: { left: number; right: number };
  reconnectActive: boolean;
  reconnectTargetNodeId: string | null;
  setReconnectActive: (active: boolean) => void;
  setReconnectTargetNodeId: (id: string | null) => void;
}): CanvasServices {
  const instance = useReactFlow<CanvasNode, CanvasEdge>();
  const nodes = useNodes<CanvasNode>();
  const nodesRef = useRef(nodes);
  useEffect(() => {
    nodesRef.current = nodes;
  }, [nodes]);

  const fitVisibleArea = useCallback(
    (
      duration: number,
      maxZoom = 1,
      fitNodeIds?: readonly string[],
    ) => {
      const pane = document.querySelector<HTMLElement>(".react-flow__pane");
      // A join-time fit passes the IDs captured from room storage. Filtering
      // here keeps a collaborator's newly added node out of that one-shot
      // viewport calculation while leaving ordinary Fit and import fits alone.
      const fitIds = fitNodeIds ? new Set(fitNodeIds) : null;
      const currentNodes = fitIds
        ? nodesRef.current.filter((node) => fitIds.has(node.id))
        : nodesRef.current;
      if (!pane || currentNodes.length === 0) return;
      const rect = pane.getBoundingClientRect();
      // The open sidebars float over the canvas edges, so fit into the visible
      // strip between them; fall back to the whole pane when the strip would
      // be too narrow (both sidebars open on a small screen, mobile overlay).
      let left = fitInsets.left;
      let right = fitInsets.right;
      if (rect.width - left - right < MIN_FIT_AVAILABILITY_PX) {
        left = 0;
        right = 0;
      }
      const bounds = getNodesBounds(currentNodes);
      if (!bounds) return;
      const viewport = getViewportForBounds(
        bounds,
        rect.width - left - right,
        rect.height,
        MIN_VIEWPORT_ZOOM,
        maxZoom,
        FIT_PADDING,
      );
      // Shift x by the left inset: the bounds were centered in the strip, so
      // the strip (not the pane) ends up centered on the content.
      void instance.setViewport(
        { x: viewport.x + left, y: viewport.y, zoom: viewport.zoom },
        { duration },
      );
    },
    [instance, fitInsets.left, fitInsets.right],
  );

  const screenToFlowPosition = useCallback(
    (point: { x: number; y: number }) => instance.screenToFlowPosition(point),
    [instance],
  );

  return useMemo(
    () => ({
      onNodesChange,
      onEdgesChange,
      fitVisibleArea,
      screenToFlowPosition,
      reconnectActive,
      reconnectTargetNodeId,
      setReconnectActive,
      setReconnectTargetNodeId,
    }),
    [
      onNodesChange,
      onEdgesChange,
      fitVisibleArea,
      screenToFlowPosition,
      reconnectActive,
      reconnectTargetNodeId,
      setReconnectActive,
      setReconnectTargetNodeId,
    ],
  );
}

/**
 * Provides the canvas services (change handlers + fit + coordinate
 * conversion) to everything rendered inside it. Rendered under the
 * explicit `ReactFlowProvider` and around `<ReactFlow>` so the node and
 * edge layers (sibling of `children`, and portalled for labels) can reach
 * the value, while the hook itself can still use `useReactFlow`.
 */
function CanvasServicesHost({
  onNodesChange,
  onEdgesChange,
  fitInsets,
  children,
}: {
  onNodesChange: (changes: NodeChange<CanvasNode>[]) => void;
  onEdgesChange: (changes: EdgeChange<CanvasEdge>[]) => void;
  fitInsets: { left: number; right: number };
  children: React.ReactNode;
}) {
  const [reconnectActive, setReconnectActive] = useState(false);
  const [reconnectTargetNodeId, setReconnectTargetNodeId] =
    useState<string | null>(null);
  const services = useCanvasServicesValue({
    onNodesChange,
    onEdgesChange,
    fitInsets,
    reconnectActive,
    reconnectTargetNodeId,
    setReconnectActive,
    setReconnectTargetNodeId,
  });
  return <CanvasServicesProvider value={services}>{children}</CanvasServicesProvider>;
}

function LiveFlowCanvas({
  importRequest,
  onTemplateImported,
  onImportConflict,
  fitInsets,
  appliedImport,
}: LiveFlowCanvasProps) {
  const {
    nodes,
    edges,
    onNodesChange,
    onEdgesChange,
    onConnect,
    onDelete,
  } = useStarterTemplateImport({
    importRequest,
    onTemplateImported,
    onImportConflict,
  });
  const flowInstanceRef =
    useRef<ReactFlowInstance<CanvasNode, CanvasEdge> | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const updateMyPresence = useUpdateMyPresence();
  const handleCanvasMouseMove = useCallback(
    (event: React.MouseEvent<Element>) => {
      const rect = event.currentTarget.getBoundingClientRect();
      updateMyPresence({
        cursor: {
          x: event.clientX - rect.left,
          y: event.clientY - rect.top,
        },
      });
    },
    [updateMyPresence],
  );
  const handleCanvasMouseLeave = useCallback(() => {
    updateMyPresence({ cursor: null });
  }, [updateMyPresence]);

  // Shape being dragged from the panel and the cursor position, driving the
  // ghost preview. Cleared on drop or cancel.
  const [dragPreview, setDragPreview] = useState<{
    shape: CanvasNodeShape;
    x: number;
    y: number;
    zoom: number;
  } | null>(null);
  const isDragging = dragPreview !== null;

  // Follow document-level pointer coordinates while dragging, then clear the
  // ghost when the drag ends (drop or cancel).
  useEffect(() => {
    if (!isDragging) return;

    const onDragOver = (event: DragEvent) => {
      setDragPreview((current) =>
        current ? { ...current, x: event.clientX, y: event.clientY } : current,
      );
    };
    const onDragEnd = () => setDragPreview(null);

    document.addEventListener("dragover", onDragOver);
    document.addEventListener("dragend", onDragEnd);
    return () => {
      document.removeEventListener("dragover", onDragOver);
      document.removeEventListener("dragend", onDragEnd);
    };
  }, [isDragging]);

  const handleShapeDragStart = useCallback(
    (shape: CanvasNodeShape, x: number, y: number) => {
      const zoom = flowInstanceRef.current?.getZoom() ?? 1;
      setDragPreview({ shape, x, y, zoom });
    },
    [],
  );

  const addCanvasNode = useCallback(
    (payload: ShapeDragPayload, position: { x: number; y: number }) => {
      // RandomUUID so IDs stay unique across collaborators, not just within
      // one browser session.
      const id = crypto.randomUUID();
      onNodesChange([
        {
          type: "add",
          item: {
            id,
            type: "canvasNode",
            position,
            style: {
              width: `${payload.width}px`,
              height: `${payload.height}px`,
            },
            data: {
              label: "",
              color: DEFAULT_NODE_COLOR,
              shape: payload.shape,
            },
          },
        },
      ]);
    },
    [onNodesChange],
  );

  const handleDragOver = (event: React.DragEvent<HTMLDivElement>) => {
    if (!event.dataTransfer.types.includes(SHAPE_DRAG_MIME)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
  };

  const handleDrop = (event: React.DragEvent<HTMLDivElement>) => {
    if (!event.dataTransfer.types.includes(SHAPE_DRAG_MIME)) return;
    event.preventDefault();

    const payload = parseShapeDragPayload(
      event.dataTransfer.getData(SHAPE_DRAG_MIME),
    );
    const instance = flowInstanceRef.current;
    if (!payload || !instance) return;

    const position = instance.screenToFlowPosition({
      x: event.clientX,
      y: event.clientY,
    });
    addCanvasNode(payload, position);
    // Hide the ghost immediately on drop (dragend also clears it; this makes
    // "hide after dropped" not depend on browser drag-end event ordering).
    setDragPreview(null);
  };

  /** Creates a shape centered in the canvas from click/keyboard activation. */
  const handleCreateShape = (shape: CanvasNodeShape) => {
    const instance = flowInstanceRef.current;
    const container = containerRef.current;
    if (!instance || !container) return;

    const size = SHAPE_SIZES[shape];
    const rect = container.getBoundingClientRect();
    // screenToFlowPosition returns the flow point under the container center;
    // shift by half the node's size so the node itself is centered there.
    // The size is in flow space, so this stays correct under any pan/zoom.
    const center = instance.screenToFlowPosition({
      x: rect.left + rect.width / 2,
      y: rect.top + rect.height / 2,
    });
    addCanvasNode(size, {
      x: center.x - size.width / 2,
      y: center.y - size.height / 2,
    });
  };

  return (
    <div
      className="relative h-full min-h-0 w-full"
      onDragOver={handleDragOver}
      onDrop={handleDrop}
      ref={containerRef}
    >
      <CanvasEdgeArrowMarker />
      {/* The services must reach the node/edge renderers, which React Flow
          paints as sibling layers to its `children` (and edge labels are
          portalled out again), so the provider sits *around* <ReactFlow> —
          not inside it. The explicit ReactFlowProvider supplies the store
          context the services need (the auto-wrapper inside <ReactFlow>
          would only reach its own subtree). */}
      <ReactFlowProvider>
        <CanvasServicesHost
          fitInsets={fitInsets}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
        >
      <ReactFlow<CanvasNode, CanvasEdge>
        className="bg-base"
        colorMode="dark"
        nodes={nodes}
        edges={edges}
        nodeTypes={canvasNodeTypes}
        edgeTypes={canvasEdgeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onDelete={onDelete}
        onMouseMove={handleCanvasMouseMove}
        onMouseLeave={handleCanvasMouseLeave}
        fitViewOptions={{ maxZoom: 1 }}
        onInit={(instance) => {
          flowInstanceRef.current = instance;
        }}
        connectionMode={ConnectionMode.Loose}
        // Drop-snap radius for connections, in flow units (screen px at
        // zoom 1): matches the 24x24 connection point hit boxes on nodes.
        connectionRadius={24}
        connectionLineType={ConnectionLineType.SmoothStep}
        defaultEdgeOptions={{
          type: "canvasEdge",
          data: { label: "" },
        }}
        fitView
      >
        <HydratedFlowFit />
        <ImportedTemplateFit importedNodes={appliedImport} />
        <CanvasPresence />
        <CanvasControls />
        <MiniMap />
        <Background
          variant={BackgroundVariant.Dots}
          color="var(--border-default)"
        />
      </ReactFlow>
        </CanvasServicesHost>
      </ReactFlowProvider>
      {dragPreview && (
        <ShapeDragPreview
          shape={dragPreview.shape}
          x={dragPreview.x}
          y={dragPreview.y}
          zoom={dragPreview.zoom}
        />
      )}
      <ShapePanel
        onCreate={handleCreateShape}
        onShapeDragStart={handleShapeDragStart}
      />
    </div>
  );
}

function CanvasLoading() {
  return (
    <div className="flex h-full min-h-0 items-center justify-center text-sm text-copy-muted">
      Connecting to shared canvas…
    </div>
  );
}

function CanvasConnectionFallback() {
  return (
    <div
      className="flex h-full min-h-0 flex-col items-center justify-center gap-3 px-6 text-center"
      role="alert"
    >
      <p className="text-sm text-copy-primary">
        The shared canvas could not connect.
      </p>
      <p className="max-w-sm text-sm text-copy-muted">
        Reload the page to try connecting again.
      </p>
      <button
        className="rounded-xl border border-surface-border bg-surface px-3 py-2 text-sm text-copy-primary hover:bg-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
        onClick={() => window.location.reload()}
        type="button"
      >
        Reload canvas
      </button>
    </div>
  );
}

function CanvasAccessRevokedFallback() {
  return (
    <div className="flex h-full min-h-0 flex-col items-center justify-center gap-3 px-6 text-center">
      <p className="text-sm text-copy-primary" role="status">
        Your access to this project has been removed.
      </p>
      <Link
        className="text-sm text-brand underline underline-offset-4"
        href="/editor"
      >
        Back to projects
      </Link>
    </div>
  );
}

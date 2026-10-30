"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  LiveblocksProvider,
  RoomProvider,
  useEventListener,
  useRoom,
  useSelf,
} from "@liveblocks/react";
import {
  ClientSideSuspense,
  useErrorListener,
  useMutableStorage,
} from "@liveblocks/react/suspense";
import { useLiveblocksFlow } from "@liveblocks/react-flow";
import {
  Background,
  BackgroundVariant,
  ConnectionLineType,
  ConnectionMode,
  MiniMap,
  ReactFlow,
  type ReactFlowInstance,
  useNodes,
  useNodesInitialized,
  useReactFlow,
} from "@xyflow/react";

import { canvasNodeTypes, ShapeDragPreview } from "@/components/editor/canvas-node";
import {
  CanvasEdgeArrowMarker,
  canvasEdgeTypes,
} from "@/components/editor/canvas-edge";
import { ShapePanel } from "@/components/editor/shape-panel";
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
}

type CanvasState = "ready" | "connection-error" | "access-revoked";

/**
 * Owns the Liveblocks connection for one authorized project room and renders
 * the collaborative React Flow canvas.
 *
 * @param props.roomId - The authorized project ID used as the Liveblocks room ID.
 */
export function LiveCanvas({ roomId }: LiveCanvasProps) {
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
            initialPresence={{ cursor: null, isThinking: false }}
          >
            <RoomConnectionErrorListener
              onConnectionError={showConnectionError}
            />
            <RoomAccessRevocationListener onAccessRevoked={showAccessRevoked} />
            <ClientSideSuspense fallback={<CanvasLoading />}>
              {() => <LiveFlowCanvas />}
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
  const { fitView, viewportInitialized } =
    useReactFlow<CanvasNode, CanvasEdge>();

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
      void fitView({ duration: 0, maxZoom: 1 });
    });

    return () => {
      disposed = true;
    };
  }, [
    fitView,
    initialRoomNodeIds,
    nodes,
    nodesInitialized,
    viewportInitialized,
  ]);

  return null;
}

function LiveFlowCanvas() {
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
  const flowInstanceRef =
    useRef<ReactFlowInstance<CanvasNode, CanvasEdge> | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

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
        fitViewOptions={{ maxZoom: 1 }}
        onInit={(instance) => {
          flowInstanceRef.current = instance;
        }}
        connectionMode={ConnectionMode.Loose}
        connectionLineType={ConnectionLineType.SmoothStep}
        defaultEdgeOptions={{
          type: "canvasEdge",
          data: { label: "" },
        }}
        fitView
      >
        <HydratedFlowFit />
        <MiniMap />
        <Background
          variant={BackgroundVariant.Dots}
          color="var(--border-default)"
        />
      </ReactFlow>
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

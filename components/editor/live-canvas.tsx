"use client";

import Link from "next/link";
import { useCallback, useRef, useState } from "react";
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
} from "@liveblocks/react/suspense";
import { useLiveblocksFlow } from "@liveblocks/react-flow";
import {
  Background,
  BackgroundVariant,
  ConnectionMode,
  MiniMap,
  ReactFlow,
  type ReactFlowInstance,
} from "@xyflow/react";

import { canvasNodeTypes } from "@/components/editor/canvas-node";
import {
  parseShapeDragPayload,
  SHAPE_DRAG_MIME,
  type ShapeDragPayload,
  ShapePanel,
} from "@/components/editor/shape-panel";
import { DEFAULT_NODE_COLOR, type CanvasEdge, type CanvasNode } from "@/types/canvas";

// Session-scoped node counter so quickly repeated drops get unique IDs even
// within the same millisecond.
let nodeCounter = 0;

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

  const addCanvasNode = useCallback(
    (payload: ShapeDragPayload, position: { x: number; y: number }) => {
      const id = `${payload.shape}-${Date.now()}-${nodeCounter++}`;
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
  };

  return (
    <div
      className="relative h-full min-h-0 w-full"
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      <ReactFlow<CanvasNode, CanvasEdge>
        className="bg-base"
        colorMode="dark"
        nodes={nodes}
        edges={edges}
        nodeTypes={canvasNodeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onDelete={onDelete}
        onInit={(instance) => {
          flowInstanceRef.current = instance;
        }}
        connectionMode={ConnectionMode.Loose}
        fitView
      >
        <MiniMap />
        <Background
          variant={BackgroundVariant.Dots}
          color="var(--border-default)"
        />
      </ReactFlow>
      <ShapePanel />
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

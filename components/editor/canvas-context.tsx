"use client";

import { createContext, useContext } from "react";
import type { EdgeChange, NodeChange } from "@xyflow/react";

import type { CanvasEdge, CanvasNode } from "@/types/canvas";

/**
 * Services the canvas node and edge renderers need to commit changes back
 * through the Liveblocks flow. Provided once inside the React Flow tree (see
 * `CanvasServicesBridge` in `live-canvas.tsx`) so renderers stay decoupled
 * from the storage layer: they emit standard React Flow changes, and the
 * provider decides how those changes reach the room.
 */
export interface CanvasServices {
  onNodesChange: (changes: NodeChange<CanvasNode>[]) => void;
  onEdgesChange: (changes: EdgeChange<CanvasEdge>[]) => void;
  /** Whether a custom endpoint-reconnection drag is active. */
  reconnectActive: boolean;
  /** Node currently near a custom endpoint-reconnection drag, if any. */
  reconnectTargetNodeId: string | null;
  /** Update the custom endpoint-reconnection drag state. */
  setReconnectActive: (active: boolean) => void;
  setReconnectTargetNodeId: (id: string | null) => void;
  /**
   * Zoom-fit nodes into the visible canvas area, which is the full pane minus
   * any open sidebars (the sidebars float over the canvas, so fitting into the
   * covered region would hide content). Falls back to the full pane when the
   * remaining area is too narrow (e.g. both sidebars open on a small screen).
   * When nodeIds is supplied, only that snapshot is fitted; this prevents a
   * collaborator's later addition from changing a join-time fit.
   */
  fitVisibleArea: (
    duration: number,
    maxZoom?: number,
    nodeIds?: readonly string[],
  ) => void;
  /** Convert a client (screen) point to flow coordinates. */
  screenToFlowPosition: (point: { x: number; y: number }) => {
    x: number;
    y: number;
  };
}

const CanvasServicesContext = createContext<CanvasServices | null>(null);

/**
 * The raw provider element; `CanvasServicesBridge` in `live-canvas.tsx` owns
 * the value so this module stays free of the storage layer.
 */
export const CanvasServicesProvider = CanvasServicesContext.Provider;

/**
 * @throws when used outside the canvas services provider.
 */
export function useCanvasServices(): CanvasServices {
  const services = useContext(CanvasServicesContext);
  if (!services) {
    throw new Error(
      "useCanvasServices must be used within the canvas services provider.",
    );
  }
  return services;
}

import type { Edge, Node } from "@xyflow/react";

/** A paired fill and text color for readable nodes on the dark canvas. */
export interface CanvasNodeColor {
  background: string;
  text: string;
}

/** The supported node fill and text color pairs, including the default. */
export const NODE_COLORS = [
  { background: "#1F1F1F", text: "#EDEDED" },
  { background: "#10233D", text: "#52A8FF" },
  { background: "#2E1938", text: "#BF7AF0" },
  { background: "#331B00", text: "#FF990A" },
  { background: "#3C1618", text: "#FF6166" },
  { background: "#3A1726", text: "#F75F8F" },
  { background: "#0F2E18", text: "#62C073" },
  { background: "#062822", text: "#0AC7B4" },
] as const satisfies readonly CanvasNodeColor[];

/** The default dark neutral node color pair. */
export const DEFAULT_NODE_COLOR = NODE_COLORS[0];

/** The supported shape names used by canvas nodes and templates. */
export const NODE_SHAPES = [
  "rectangle",
  "diamond",
  "circle",
  "pill",
  "cylinder",
  "hexagon",
] as const;

export type CanvasNodeColorPair = (typeof NODE_COLORS)[number];
export type CanvasNodeShape = (typeof NODE_SHAPES)[number];

/** Custom MIME type for the shape drag payload, so other drags are ignored. */
export const SHAPE_DRAG_MIME = "application/x-foster-shape";

/** The payload carried when a shape is dragged from the bottom panel. */
export interface ShapeDragPayload {
  shape: CanvasNodeShape;
  width: number;
  height: number;
}

/**
 * Default canvas size (px) for each shape, applied when a node is created.
 *
 * Rectangles are wider than tall, circles are square, and diamonds are
 * slightly larger than the others so their labels have room.
 */
export const SHAPE_SIZES: Record<CanvasNodeShape, ShapeDragPayload> = {
  rectangle: { shape: "rectangle", width: 180, height: 100 },
  diamond: { shape: "diamond", width: 220, height: 120 },
  circle: { shape: "circle", width: 120, height: 120 },
  pill: { shape: "pill", width: 160, height: 64 },
  cylinder: { shape: "cylinder", width: 140, height: 100 },
  hexagon: { shape: "hexagon", width: 200, height: 110 },
};

/**
 * Parses and validates a raw shape drag payload from a drop event.
 *
 * @param raw - The raw string read from the drop event's data transfer.
 * @returns The validated payload, or null when the payload is missing, not
 *   valid JSON, or not a known shape with positive dimensions.
 */
export function parseShapeDragPayload(raw: string): ShapeDragPayload | null {
  if (!raw) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }

  if (typeof parsed !== "object" || parsed === null) return null;
  const candidate = parsed as Partial<ShapeDragPayload>;

  if (
    typeof candidate.shape !== "string" ||
    !NODE_SHAPES.includes(candidate.shape as CanvasNodeShape) ||
    typeof candidate.width !== "number" ||
    typeof candidate.height !== "number" ||
    !Number.isFinite(candidate.width) ||
    !Number.isFinite(candidate.height) ||
    candidate.width <= 0 ||
    candidate.height <= 0
  ) {
    return null;
  }

  return {
    shape: candidate.shape as CanvasNodeShape,
    width: candidate.width,
    height: candidate.height,
  };
}

/** Shared, serializable data stored on each architecture canvas node. */
export interface CanvasNodeData extends Record<string, unknown> {
  label: string;
  color: CanvasNodeColorPair;
  shape: CanvasNodeShape;
}

/** React Flow node type used by the shared canvas. */
export type CanvasNode = Node<CanvasNodeData, "canvasNode">;

/** React Flow edge type used by the shared canvas. */
export type CanvasEdge = Edge<Record<string, unknown>, "canvasEdge">;

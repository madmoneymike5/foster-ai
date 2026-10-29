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

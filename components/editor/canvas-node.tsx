"use client";

import { useMutation } from "@liveblocks/react";
import {
  type ChangeEvent,
  type KeyboardEvent,
  type MouseEvent,
  type PointerEvent as ReactPointerEvent,
  type SyntheticEvent,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Handle,
  NodeToolbar,
  Position,
  type NodeChange,
  type NodeProps,
  type NodeTypes,
  useKeyPress,
  useStore,
  useStoreApi,
} from "@xyflow/react";

import { useCanvasServices } from "@/components/editor/canvas-context";
import {
  DEFAULT_NODE_COLOR,
  NODE_COLORS,
  normalizeNodeColor,
  SHAPE_SIZES,
  type CanvasNode,
  type CanvasNodeColorPair,
  type CanvasNodeShape,
} from "@/types/canvas";

const SVG_SHAPE_STROKE = 2;
const MIN_NODE_WIDTH = 80;
const MIN_NODE_HEIGHT = 48;
const EMPTY_LABEL_PLACEHOLDER = "Label";
/**
 * Keep node-label writes small enough that a paste cannot turn every
 * keystroke into a multi-megabyte Liveblocks update. The same limit is exposed
 * on the textarea so normal typing and pasted input share one contract.
 */
const MAX_NODE_LABEL_LENGTH = 256;
/**
 * Half-width of the band around a visible outline segment that counts as
 * "hovering the segment" for resize (flow units, so it reads as roughly the
 * same thickness at typical zooms).
 */
const RESIZE_BAND_PX = 10;
/** Half of a connection point's square hit box; points inside it beat resize. */
const CONNECTION_POINT_PX = 12;
/** Reveal target points before the pointer reaches the 24px drop radius. */
const TARGET_POINT_PREVIEW_DISTANCE = 64;

/**
 * The eight connection points around every node: the midpoints of the
 * bounding box's four sides plus its four corners. All use the `source`
 * type — the canvas runs in `ConnectionMode.Loose`, so any point can start
 * a connection and any point on another node can end it. `u`/`v` place each
 * point in the node's 0-1 box (y down).
 */
interface ConnectionPoint {
  id: string;
  position: Position;
  u: number;
  v: number;
  cornerClass: string;
}

const CONNECTION_POINTS: readonly ConnectionPoint[] = [
  { id: "top", position: Position.Top, u: 0.5, v: 0, cornerClass: "" },
  { id: "right", position: Position.Right, u: 1, v: 0.5, cornerClass: "" },
  { id: "bottom", position: Position.Bottom, u: 0.5, v: 1, cornerClass: "" },
  { id: "left", position: Position.Left, u: 0, v: 0.5, cornerClass: "" },
  {
    id: "corner-top-left",
    position: Position.Top,
    u: 0,
    v: 0,
    cornerClass: "canvas-handle-corner-tl",
  },
  {
    id: "corner-top-right",
    position: Position.Top,
    u: 1,
    v: 0,
    cornerClass: "canvas-handle-corner-tr",
  },
  {
    id: "corner-bottom-left",
    position: Position.Bottom,
    u: 0,
    v: 1,
    cornerClass: "canvas-handle-corner-bl",
  },
  {
    id: "corner-bottom-right",
    position: Position.Bottom,
    u: 1,
    v: 1,
    cornerClass: "canvas-handle-corner-br",
  },
] as const;

/**
 * Convert a `#rrggbb` node color into a translucent `rgba()` variant so node
 * borders can read as subtle at rest and bright when selected.
 *
 * @param hex - A 6-digit hex color (e.g. `#52A8FF`).
 * @param alpha - The alpha channel (0-1) for the derived color.
 * @returns The derived `rgba()` color, or the input unchanged if it is not
 *   a 6-digit hex value.
 */
function withAlpha(hex: string, alpha: number): string {
  const body = hex.replace(/^#/, "");
  if (body.length !== 6) return hex;
  const r = Number.parseInt(body.slice(0, 2), 16);
  const g = Number.parseInt(body.slice(2, 4), 16);
  const b = Number.parseInt(body.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

interface SvgShapeProps {
  shape: "diamond" | "hexagon" | "cylinder";
  fill: string;
  stroke: string;
}

/**
 * SVG geometry for the three shapes CSS borders cannot express (diamond,
 * hexagon, cylinder). Drawn in a 0-100 viewBox the caller stretches to the
 * node's width and height, so the shapes scale with node size.
 *
 * @param props.shape - Which SVG shape to draw.
 * @param props.fill - The node background fill color.
 * @param props.stroke - The border color (subtle at rest, bright when selected).
 */
function SvgShape({ shape, fill, stroke }: SvgShapeProps) {
  const common = {
    fill,
    stroke,
    strokeWidth: SVG_SHAPE_STROKE,
    vectorEffect: "non-scaling-stroke" as const,
  };

  switch (shape) {
    case "diamond":
      return <polygon {...common} points="50,1 99,50 50,99 1,50" />;
    case "hexagon":
      return <polygon {...common} points="25,1 75,1 99,50 75,99 25,99 1,50" />;
    case "cylinder":
      return (
        <>
          <path {...common} d="M 1 15 C 1 7 99 7 99 15 V 85 C 99 93 1 93 1 85 Z" />
          <ellipse
            cx="50"
            cy="15"
            fill={fill}
            rx="49"
            ry="8"
            stroke={stroke}
            strokeWidth={SVG_SHAPE_STROKE}
            vectorEffect="non-scaling-stroke"
          />
        </>
      );
  }
}

interface ShapeSurfaceProps {
  shape: CanvasNodeShape;
  background: string;
  color: string;
  selected?: boolean;
}

/**
 * Renders one node shape filling its positioned, sized container.
 *
 * Rectangle, pill, and circle use CSS borders; diamond, hexagon, and cylinder
 * use inline SVG stretched to the container. The border is subtle at rest and
 * brightens (with a soft glow) when `selected` is true.
 *
 * @param props.shape - Which shape to render.
 * @param props.background - The node fill color.
 * @param props.color - The vivid border/label color.
 * @param props.selected - Whether to render the bright selected border.
 */
function ShapeSurface({
  shape,
  background,
  color,
  selected = false,
}: ShapeSurfaceProps) {
  const border = selected ? color : withAlpha(color, 0.45);
  const selectedShadow = selected
    ? `0 0 0 1px ${withAlpha(color, 0.5)}, 0 0 20px ${withAlpha(color, 0.35)}`
    : undefined;
  const selectedFilter = selected
    ? `drop-shadow(0 0 6px ${withAlpha(color, 0.5)})`
    : undefined;

  if (shape === "rectangle" || shape === "pill" || shape === "circle") {
    return (
      <div
        aria-hidden="true"
        className="absolute inset-0"
        style={{
          backgroundColor: background,
          borderRadius:
            shape === "circle" ? "50%" : shape === "pill" ? "9999px" : "0.5rem",
          border: `2px solid ${border}`,
          boxSizing: "border-box",
          boxShadow: selectedShadow,
        }}
      />
    );
  }

  return (
    <svg
      aria-hidden="true"
      className="absolute inset-0 h-full w-full"
      preserveAspectRatio="none"
      viewBox="0 0 100 100"
      style={selectedFilter ? { filter: selectedFilter } : undefined}
    >
      <SvgShape shape={shape} fill={background} stroke={border} />
    </svg>
  );
}

interface ColorSwatchProps {
  color: CanvasNodeColorPair;
  active: boolean;
  onSelect: (color: CanvasNodeColorPair) => void;
}

/**
 * One color-pair swatch in the node color toolbar.
 *
 * Shows both colors of the pair (fill = background, border = text). Hovering
 * adds a tight glow in the pair's text color; the active swatch gets a scaled,
 * double ring so the current pair is unambiguous.
 *
 * @param props.color - The background/text pair this swatch applies.
 * @param props.active - Whether the node currently uses this pair.
 * @param props.onSelect - Called with the pair when the swatch is activated.
 */
function ColorSwatch({ color, active, onSelect }: ColorSwatchProps) {
  const [hovered, setHovered] = useState(false);

  // Composed so active ring and hover glow combine deterministically instead
  // of fighting over one box-shadow through CSS variant ordering.
  const shadows: string[] = [];
  if (hovered) shadows.push(`0 0 5px 1px ${withAlpha(color.text, 0.7)}`);
  if (active) {
    shadows.push(`0 0 0 2px var(--bg-base)`, `0 0 0 3.5px ${color.text}`);
  } else {
    shadows.push(`inset 0 0 0 1px ${withAlpha(color.text, 0.35)}`);
  }

  return (
    <button
      aria-label={`Set node color: background ${color.background}, text ${color.text}`}
      aria-pressed={active}
      className="nodrag nopan nowheel h-4 w-4 cursor-pointer rounded-full transition-transform duration-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
      onClick={() => onSelect(color)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        backgroundColor: color.background,
        boxShadow: shadows.join(", "),
        transform: active ? "scale(1.15)" : undefined,
      }}
      type="button"
    />
  );
}

interface ShapeDragPreviewProps {
  shape: CanvasNodeShape;
  x: number;
  y: number;
  zoom: number;
}

/**
 * A translucent preview of a shape that follows the cursor while it is dragged
 * from the shape panel. Anchored to the cursor's top-left corner — the same
 * corner the node lands on when dropped — at the shape's default size scaled
 * by the current canvas zoom, so it matches the node's on-screen size.
 *
 * @param props.shape - The shape being dragged.
 * @param props.x - Viewport x of the cursor.
 * @param props.y - Viewport y of the cursor.
 * @param props.zoom - The React Flow viewport zoom at drag start.
 */
export function ShapeDragPreview({
  shape,
  x,
  y,
  zoom,
}: ShapeDragPreviewProps) {
  const size = SHAPE_SIZES[shape];
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed z-50"
      style={{
        left: x,
        top: y,
        width: size.width * zoom,
        height: size.height * zoom,
        opacity: 0.5,
      }}
    >
      <ShapeSurface
        background={DEFAULT_NODE_COLOR.background}
        color={DEFAULT_NODE_COLOR.text}
        shape={shape}
      />
    </div>
  );
}

/** How an outline segment drag resizes the node's box. */
type ResizeMode =
  | { kind: "side"; side: "top" | "right" | "bottom" | "left" }
  | {
      kind: "corner";
      corner: "top-left" | "top-right" | "bottom-left" | "bottom-right";
    };

/** One visible outline segment in the node's 0-1 box space (y down). */
interface OutlineSegment {
  a: [number, number];
  b: [number, number];
  mode: ResizeMode;
}

const SIDE = {
  top: { kind: "side", side: "top" },
  right: { kind: "side", side: "right" },
  bottom: { kind: "side", side: "bottom" },
  left: { kind: "side", side: "left" },
} as const;
const CORNER = {
  topLeft: { kind: "corner", corner: "top-left" },
  topRight: { kind: "corner", corner: "top-right" },
  bottomLeft: { kind: "corner", corner: "bottom-left" },
  bottomRight: { kind: "corner", corner: "bottom-right" },
} as const;

/**
 * The visible outline segments for each shape, in the node's 0-1 box space
 * (y down). Each segment carries the resize mode dragging it performs: a side
 * drag moves that edge along its axis (cylinder: side = diameter, top/bottom
 * = height); a corner drag moves both perpendicular edges, deforming the
 * adjoining segments (a hexagon dragged far enough collapses a vertex into a
 * point, as its polygon is recomputed from the box).
 *
 * The pill and circle are approximated by polygons so their rounded outlines
 * are hit-testable; the circle's 16 sides map onto the eight compass
 * directions, giving it four axis zones and four diagonal zones.
 */
function outlineSegments(
  shape: CanvasNodeShape,
  width: number,
  height: number,
): OutlineSegment[] {
  switch (shape) {
    case "rectangle":
      return [
        { a: [0, 0], b: [1, 0], mode: SIDE.top },
        { a: [1, 0], b: [1, 1], mode: SIDE.right },
        { a: [1, 1], b: [0, 1], mode: SIDE.bottom },
        { a: [0, 1], b: [0, 0], mode: SIDE.left },
      ];
    case "pill": {
      // Keep the straight top and bottom runs, but sample each rounded cap so
      // hit testing follows the rendered outline instead of cutting across it.
      const radius = Math.min(width, height) / 2;
      const rx = radius / width;
      const ry = radius / height;
      const segments: OutlineSegment[] = [
        { a: [rx, 0], b: [1 - rx, 0], mode: SIDE.top },
      ];
      const capSteps = 8;
      for (let i = 0; i < capSteps; i++) {
        const t0 = -Math.PI / 2 + (i / capSteps) * Math.PI;
        const t1 = -Math.PI / 2 + ((i + 1) / capSteps) * Math.PI;
        segments.push({
          a: [1 - rx + rx * Math.cos(t0), 0.5 + ry * Math.sin(t0)],
          b: [1 - rx + rx * Math.cos(t1), 0.5 + ry * Math.sin(t1)],
          mode: compassMode((t0 + t1) / 2),
        });
      }
      segments.push({
        a: [1 - rx, 1],
        b: [rx, 1],
        mode: SIDE.bottom,
      });
      for (let i = 0; i < capSteps; i++) {
        const t0 = Math.PI / 2 + (i / capSteps) * Math.PI;
        const t1 = Math.PI / 2 + ((i + 1) / capSteps) * Math.PI;
        segments.push({
          a: [rx + rx * Math.cos(t0), 0.5 + ry * Math.sin(t0)],
          b: [rx + rx * Math.cos(t1), 0.5 + ry * Math.sin(t1)],
          mode: compassMode((t0 + t1) / 2),
        });
      }
      return segments;
    }
    case "circle": {
      const segments: OutlineSegment[] = [];
      const sides = 16;
      for (let i = 0; i < sides; i++) {
        const t0 = (i / sides) * Math.PI * 2 - Math.PI / 2;
        const t1 = ((i + 1) / sides) * Math.PI * 2 - Math.PI / 2;
        segments.push({
          a: [0.5 + 0.5 * Math.cos(t0), 0.5 + 0.5 * Math.sin(t0)],
          b: [0.5 + 0.5 * Math.cos(t1), 0.5 + 0.5 * Math.sin(t1)],
          mode: compassMode((t0 + t1) / 2),
        });
      }
      return segments;
    }
    case "diamond":
      return [
        { a: [0.5, 0], b: [1, 0.5], mode: CORNER.topRight },
        { a: [1, 0.5], b: [0.5, 1], mode: CORNER.bottomRight },
        { a: [0.5, 1], b: [0, 0.5], mode: CORNER.bottomLeft },
        { a: [0, 0.5], b: [0.5, 0], mode: CORNER.topLeft },
      ];
    case "hexagon":
      return [
        { a: [0.25, 0.01], b: [0.75, 0.01], mode: SIDE.top },
        { a: [0.75, 0.01], b: [0.99, 0.5], mode: CORNER.topRight },
        { a: [0.99, 0.5], b: [0.75, 0.99], mode: CORNER.bottomRight },
        { a: [0.75, 0.99], b: [0.25, 0.99], mode: SIDE.bottom },
        { a: [0.25, 0.99], b: [0.01, 0.5], mode: CORNER.bottomLeft },
        { a: [0.01, 0.5], b: [0.25, 0.01], mode: CORNER.topLeft },
      ];
    case "cylinder":
      // The drawn outline: ellipse caps at y≈7/93 (0-100 viewBox), sides at
      // x≈1/99 between the caps.
      return [
        { a: [0.01, 0.07], b: [0.99, 0.07], mode: SIDE.top },
        { a: [0.99, 0.07], b: [0.99, 0.93], mode: SIDE.right },
        { a: [0.99, 0.93], b: [0.01, 0.93], mode: SIDE.bottom },
        { a: [0.01, 0.93], b: [0.01, 0.07], mode: SIDE.left },
      ];
  }
}

/** Project a corner handle onto the rendered outline along the center ray. */
function connectionPointPosition(
  shape: CanvasNodeShape,
  width: number,
  height: number,
  point: (typeof CONNECTION_POINTS)[number],
): { u: number; v: number } {
  if (!point.id.startsWith("corner-")) return { u: point.u, v: point.v };
  const direction: Record<string, [number, number]> = {
    "corner-top-left": [-1, -1],
    "corner-top-right": [1, -1],
    "corner-bottom-left": [-1, 1],
    "corner-bottom-right": [1, 1],
  };
  const ray = direction[point.id];
  if (!ray) return { u: point.u, v: point.v };
  const cross = (a: [number, number], b: [number, number]) =>
    a[0] * b[1] - a[1] * b[0];
  let nearest: { t: number; u: number; v: number } | null = null;
  for (const segment of outlineSegments(shape, width, height)) {
    const edge: [number, number] = [
      segment.b[0] - segment.a[0],
      segment.b[1] - segment.a[1],
    ];
    const denominator = cross(ray, edge);
    if (Math.abs(denominator) < Number.EPSILON) continue;
    const fromCenter: [number, number] = [segment.a[0] - 0.5, segment.a[1] - 0.5];
    const t = cross(fromCenter, edge) / denominator;
    const along = cross(fromCenter, ray) / denominator;
    if (t < 0 || along < 0 || along > 1) continue;
    if (!nearest || t < nearest.t) {
      nearest = {
        t,
        u: 0.5 + ray[0] * t,
        v: 0.5 + ray[1] * t,
      };
    }
  }
  return nearest ? { u: nearest.u, v: nearest.v } : { u: point.u, v: point.v };
}

/**
 * Map an ellipse angle (0 = east, 90° = south — y is down) to the nearest of
 * the eight compass directions: cardinals become side resizes, diagonals
 * become corner resizes.
 */
function compassMode(angle: number): ResizeMode {
  const deg = ((angle * 180) / Math.PI + 360) % 360;
  switch (Math.round(deg / 45) % 8) {
    case 0:
      return SIDE.right;
    case 1:
      return CORNER.bottomRight;
    case 2:
      return SIDE.bottom;
    case 3:
      return CORNER.bottomLeft;
    case 4:
      return SIDE.left;
    case 5:
      return CORNER.topLeft;
    case 6:
      return SIDE.top;
    default:
      return CORNER.topRight;
  }
}

/**
 * Distance (in flow px) from a local point to a unit-space segment scaled to
 * the node box, ignoring caps (the outline is a closed loop, so adjacent
 * segments cover the endpoints).
 */
function segmentDistance(
  segment: OutlineSegment,
  width: number,
  height: number,
  lx: number,
  ly: number,
): number {
  const ax = segment.a[0] * width;
  const ay = segment.a[1] * height;
  const bx = segment.b[0] * width;
  const by = segment.b[1] * height;
  const dx = bx - ax;
  const dy = by - ay;
  const lengthSq = dx * dx + dy * dy;
  let t = lengthSq === 0 ? 0 : ((lx - ax) * dx + (ly - ay) * dy) / lengthSq;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(lx - (ax + t * dx), ly - (ay + t * dy));
}

/**
 * Find the outline segment under a local (flow-px) point, or `null` when the
 * point is outside the resize band or inside a connection point's hit box
 * (connection points take precedence over resize where they overlap).
 */
function hitResizeSegment(
  shape: CanvasNodeShape,
  width: number,
  height: number,
  lx: number,
  ly: number,
): ResizeMode | null {
  for (const point of CONNECTION_POINTS) {
    const projected = connectionPointPosition(shape, width, height, point);
    if (
      Math.hypot(lx - projected.u * width, ly - projected.v * height) <=
      CONNECTION_POINT_PX
    ) {
      return null;
    }
  }
  let best: { dist: number; mode: ResizeMode } | null = null;
  for (const segment of outlineSegments(shape, width, height)) {
    const dist = segmentDistance(segment, width, height, lx, ly);
    if (dist <= RESIZE_BAND_PX && (!best || dist < best.dist)) {
      best = { dist, mode: segment.mode };
    }
  }
  return best ? best.mode : null;
}

/** The bidirectional arrow cursor for a resize mode. */
function resizeCursor(mode: ResizeMode): string {
  if (mode.kind === "side") {
    return mode.side === "top" || mode.side === "bottom"
      ? "ns-resize"
      : "ew-resize";
  }
  return mode.corner === "top-left" || mode.corner === "bottom-right"
    ? "nwse-resize"
    : "nesw-resize";
}

interface NodeBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface ResizeDrag {
  mode: ResizeMode;
  pointerX: number;
  pointerY: number;
  /** The box at the start of the gesture. Deltas are always measured from
      here so repeated intermediate commits stay idempotent. */
  startBox: NodeBox;
  /** The box after the latest commit (feeds the release-time change). */
  box: NodeBox;
}

const clamp = (value: number, min: number) => Math.max(min, value);

/**
 * The pointer id every mouse-originated gesture carries (per the Pointer
 * Events spec, `PointerEvent.MOUSE_POINTER_ID`). Referenced as a literal
 * because the installed TypeScript lib omits the constant.
 */
const MOUSE_POINTER_ID = 1;

/**
 * Compute the node box after applying a segment resize. `pointer` is the
 * current pointer position in flow coordinates; the delta is measured from
 * the drag's start. With `keepAspect` (Control held) the box preserves its
 * start aspect ratio: side drags re-center on the fixed axis, corner drags
 * anchor on the opposite corner.
 */
function applyResize(
  drag: ResizeDrag,
  pointer: { x: number; y: number },
  keepAspect: boolean,
): NodeBox {
  const { mode, box } = drag;
  const dx = pointer.x - drag.pointerX;
  const dy = pointer.y - drag.pointerY;
  const ratio = box.w / box.h;
  let { x, y, w, h } = box;

  const lockHeight = (newWidth: number) => {
    h = clamp(newWidth / ratio, MIN_NODE_HEIGHT);
    w = clamp(h * ratio, MIN_NODE_WIDTH);
  };
  const lockWidth = (newHeight: number) => {
    w = clamp(newHeight * ratio, MIN_NODE_WIDTH);
    h = clamp(w / ratio, MIN_NODE_HEIGHT);
  };

  if (mode.kind === "side") {
    switch (mode.side) {
      case "right":
        w = clamp(w + dx, MIN_NODE_WIDTH);
        if (keepAspect) {
          lockHeight(w);
          y += (box.h - h) / 2;
        }
        break;
      case "left":
        w = clamp(w - dx, MIN_NODE_WIDTH);
        if (keepAspect) {
          lockHeight(w);
          y += (box.h - h) / 2;
        }
        x += box.w - w;
        break;
      case "top":
        h = clamp(h - dy, MIN_NODE_HEIGHT);
        if (keepAspect) {
          lockWidth(h);
          x += (box.w - w) / 2;
        }
        y += box.h - h;
        break;
      case "bottom":
        h = clamp(h + dy, MIN_NODE_HEIGHT);
        if (keepAspect) {
          lockWidth(h);
          x += (box.w - w) / 2;
        }
        break;
    }
    return { x, y, w, h };
  }

  // Corner drags anchor on the opposite corner.
  switch (mode.corner) {
    case "top-right":
      w = clamp(w + dx, MIN_NODE_WIDTH);
      h = clamp(h - dy, MIN_NODE_HEIGHT);
      if (keepAspect) lockHeight(w);
      y += box.h - h;
      return { x, y, w, h };
    case "bottom-right":
      w = clamp(w + dx, MIN_NODE_WIDTH);
      h = clamp(h + dy, MIN_NODE_HEIGHT);
      if (keepAspect) lockHeight(w);
      return { x, y, w, h };
    case "top-left":
      w = clamp(w - dx, MIN_NODE_WIDTH);
      h = clamp(h - dy, MIN_NODE_HEIGHT);
      if (keepAspect) lockHeight(w);
      x += box.w - w;
      y += box.h - h;
      return { x, y, w, h };
    case "bottom-left":
      w = clamp(w - dx, MIN_NODE_WIDTH);
      h = clamp(h + dy, MIN_NODE_HEIGHT);
      if (keepAspect) lockHeight(w);
      x += box.w - w;
      return { x, y, w, h };
  }
}

/**
 * Renderer for the shared canvas node type.
 *
 * Draws the node's shape (see `ShapeSurface`) with the label centered over
 * it. The wrapper's width and height come from the node's stored dimensions;
 * this component renders inside that wrapper, so the shape fills it exactly.
 *
 * Interaction model:
 * - Eight connection points (side midpoints + corners) let a connection
 *   start; dots fade in when the node is hovered or when a connection is
 *   being dragged within snap distance, so targets reveal before the cursor
 *   has to land fully on the shape.
 * - Resizing follows the drawn outline: hovering a visible segment shows a
 *   bidirectional arrow, and dragging it resizes the node's box through the
 *   standard `dimensions` change stream (one history entry per gesture).
 *   Segments near the eight connection points defer to them.
 *
 * @param props - The React Flow node props for a `canvasNode` node.
 */
export function CanvasNodeView({ id, data, selected }: NodeProps<CanvasNode>) {
  const [isEditing, setIsEditing] = useState(false);
  const controlPressed = useKeyPress("Control", { preventDefault: false });
  const store = useStoreApi();
  const services = useCanvasServices();
  const [draftLabel, setDraftLabel] = useState(data.label);
  const nodeElementRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [isHovered, setIsHovered] = useState(false);
  const [hoverCursor, setHoverCursor] = useState<string | null>(null);
  const resizeDragRef = useRef<ResizeDrag | null>(null);

  const updateLabel = useMutation(
    ({ storage }, label: string) => {
      const node = storage.get("flow")?.get("nodes").get(id);
      const nodeData = node?.get("data");
      if (nodeData) nodeData.set("label", label);
    },
    [id],
  );
  const updateColor = useMutation(
    ({ storage }, color: CanvasNodeColorPair) => {
      const node = storage.get("flow")?.get("nodes").get(id);
      const nodeColor = node?.get("data")?.get("color");
      // Mutate the stored LiveObject's fields in place (not `set("color", …)`
      // with a plain object) so background and text change together in one
      // batched collaborative update.
      if (nodeColor) {
        nodeColor.set("background", color.background);
        nodeColor.set("text", color.text);
      }
    },
    [id],
  );
  // Liveblocks deep-copies storage values, so active comparison is by both
  // fields, not object identity. Normalize legacy stored pairs first so an
  // older node still has one visibly active swatch in the current palette.
  const displayColor = normalizeNodeColor(data.color);
  const isColorActive = (pair: CanvasNodeColorPair) =>
    displayColor.background === pair.background &&
    displayColor.text === pair.text;

  // Liveblocks can hydrate a node after React Flow's initial empty mount. The
  // node's own effect runs after its handles exist, which is the safe point to
  // populate React Flow's measured dimensions and handle bounds for edges.
  useEffect(() => {
    let disposed = false;
    queueMicrotask(() => {
      if (disposed) return;

      const { updateNodeInternals } = store.getState();
      const nodeElement = nodeElementRef.current;
      if (!nodeElement) return;

      updateNodeInternals(
        new Map([[id, { id, nodeElement, force: true }]]),
        { triggerFitView: false },
      );
    });

    return () => {
      disposed = true;
    };
  }, [id, store]);

  useEffect(() => {
    if (!isEditing) return;
    textareaRef.current?.focus();
    textareaRef.current?.select();
  }, [isEditing]);

  /**
   * Connection points within snap distance while a connection is being
   * dragged, as a stable string (a fresh object per store change would
   * re-render every node on every pan frame).
   */
  const nearPointIds = useStore((state) => {
    const connection = state.connection;
    if (!connection.inProgress || !connection.to || !connection.fromNode) {
      return "";
    }
    const internal = state.nodeLookup.get(id);
    if (!internal || id === connection.fromNode.id) return "";
    const width = internal.width ?? internal.measured?.width;
    const height = internal.height ?? internal.measured?.height;
    if (!width || !height) return "";
    const position = internal.internals.positionAbsolute;
    const distanceX = Math.max(
      position.x - connection.to.x,
      0,
      connection.to.x - (position.x + width),
    );
    const distanceY = Math.max(
      position.y - connection.to.y,
      0,
      connection.to.y - (position.y + height),
    );
    // Reveal every target point while the pointer approaches the node. The
    // actual 24px per-point snap radius remains React Flow's drop contract.
    if (
      Math.hypot(distanceX, distanceY) <= TARGET_POINT_PREVIEW_DISTANCE
    ) {
      return CONNECTION_POINTS.map((point) => point.id).join("|");
    }
    return "";
  });
  const nearPoints = useMemo(
    () => new Set(nearPointIds ? nearPointIds.split("|") : []),
    [nearPointIds],
  );
  const connectionSourceNodeId = useStore((state) =>
    state.connection.inProgress ? state.connection.fromNode?.id ?? null : null,
  );
  const showHoveredPoints =
    isHovered &&
    !services.reconnectActive &&
    connectionSourceNodeId !== id;

  /** Read this node's current box straight from the store (no re-render). */
  const readBox = (): NodeBox | null => {
    const internal = store.getState().nodeLookup.get(id);
    if (!internal) return null;
    const w = internal.width ?? internal.measured?.width;
    const h = internal.height ?? internal.measured?.height;
    if (!w || !h) return null;
    const position = internal.internals.positionAbsolute;
    return { x: position.x, y: position.y, w, h };
  };

  /** Local (flow-px, node-relative) point for a client point. */
  const localPoint = (clientX: number, clientY: number) => {
    const flow = services.screenToFlowPosition({ x: clientX, y: clientY });
    const box = readBox();
    if (!box) return null;
    return { lx: flow.x - box.x, ly: flow.y - box.y, flow, box };
  };

  const startEditing = (event: SyntheticEvent<HTMLDivElement>) => {
    event.stopPropagation();
    setDraftLabel(data.label);
    setIsEditing(true);
  };
  const handleLabelKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    event.stopPropagation();
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      startEditing(event);
    }
  };
  const handleLabelChange = (event: ChangeEvent<HTMLTextAreaElement>) => {
    // Browsers enforce maxLength for ordinary input, but explicitly slicing
    // here also protects the storage mutation from oversized pasted or
    // programmatically supplied values.
    const label = event.target.value.slice(0, MAX_NODE_LABEL_LENGTH);
    setDraftLabel(label);
    updateLabel(label);
  };
  const handleTextareaKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    event.stopPropagation();
    if (event.key === "Escape") {
      event.preventDefault();
      setIsEditing(false);
    }
  };
  const stopCanvasInteraction = (event: SyntheticEvent) => {
    event.stopPropagation();
  };

  /**
   * Mouse move over the node (not during a resize drag): show the
   * bidirectional arrow when the cursor is on a visible outline segment.
   * Skipped entirely over connection points, the color toolbar, and the
   * label editor, which own their own cursors/behavior.
   */
  const handleMouseMove = (event: MouseEvent<HTMLDivElement>) => {
    if (resizeDragRef.current || isEditing) {
      return;
    }
    const target = event.target as Element;
    if (
      target.closest(".react-flow__handle") ||
      target.closest(".react-flow__node-toolbar") ||
      target.closest("textarea")
    ) {
      if (hoverCursor) setHoverCursor(null);
      return;
    }
    const local = localPoint(event.clientX, event.clientY);
    const mode = local
      ? hitResizeSegment(data.shape, local.box.w, local.box.h, local.lx, local.ly)
      : null;
    const cursor = mode ? resizeCursor(mode) : null;
    if (cursor !== hoverCursor) setHoverCursor(cursor);
  };

  const commitResize = (drag: ResizeDrag, flow: { x: number; y: number }) => {
    // Always recompute from the start box with the total delta — applying
    // the delta to the already-moved box would compound every commit.
    const next = applyResize({ ...drag, box: drag.startBox }, flow, controlPressed);
    if (
      next.x === drag.box.x &&
      next.y === drag.box.y &&
      next.w === drag.box.w &&
      next.h === drag.box.h
    ) {
      return;
    }
    const changes: NodeChange<CanvasNode>[] = [];
    if (next.x !== drag.box.x || next.y !== drag.box.y) {
      changes.push({ type: "position", id, position: { x: next.x, y: next.y } });
    }
    changes.push({
      type: "dimensions",
      id,
      resizing: true,
      setAttributes:
        next.w !== drag.box.w && next.h !== drag.box.h
          ? true
          : next.w !== drag.box.w
            ? "width"
            : "height",
      dimensions: { width: next.w, height: next.h },
    });
    services.onNodesChange(changes);
    drag.box = next;
  };

  /**
   * Mouse down on the node body: start an outline resize when the press
   * lands on a visible segment (stopping propagation so React Flow does not
   * also drag the node), otherwise let the event bubble for the normal node
   * drag. Connection point presses are left alone — the handle element owns
   * them and starts a React Flow connection.
   *
   * This must run as a native *capture-phase* listener: React Flow's
   * d3-drag attaches its mousedown to the node wrapper element, and React's
   * delegated synthetic handlers only fire once the event reaches the app
   * root — after d3-drag has already started a node drag. In the capture
   * phase the press is still on its way in, so stopping it here keeps
   * d3-drag from ever seeing resize-segment presses.
   */
  const resizeMouseDownRef = useRef<(event: WindowEventMap["mousedown"]) => void>(
    () => {},
  );
  const beginResize = (clientX: number, clientY: number, pointerId: number) => {
    if (resizeDragRef.current || isEditing) return false;
    const local = localPoint(clientX, clientY);
    if (!local) return false;
    const mode = hitResizeSegment(
      data.shape,
      local.box.w,
      local.box.h,
      local.lx,
      local.ly,
    );
    if (!mode) return false;

    resizeDragRef.current = {
      mode,
      pointerX: local.flow.x,
      pointerY: local.flow.y,
      startBox: local.box,
      box: local.box,
    };
    const nodeElement = nodeElementRef.current;
    if (!nodeElement) {
      resizeDragRef.current = null;
      return false;
    }
    try {
      nodeElement.setPointerCapture(pointerId);
    } catch {
      // A failed capture must not leave a resize armed for unrelated moves.
      resizeDragRef.current = null;
      return false;
    }
    return true;
  };
  useLayoutEffect(() => {
    resizeMouseDownRef.current = (event: WindowEventMap["mousedown"]) => {
      if (event.button !== 0 || isEditing) return;
      const target = event.target as Element;
      if (
        target.closest(".react-flow__handle") ||
        target.closest(".react-flow__node-toolbar") ||
        target.closest("textarea")
      ) {
        return;
      }
      if (!beginResize(event.clientX, event.clientY, MOUSE_POINTER_ID)) return;
      event.stopPropagation();
    };
  });
  useEffect(() => {
    const el = nodeElementRef.current;
    if (!el) return;
    const listener = (event: WindowEventMap["mousedown"]) =>
      resizeMouseDownRef.current(event);
    el.addEventListener("mousedown", listener, true);
    return () => el.removeEventListener("mousedown", listener, true);
  }, []);

  const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.pointerType !== "touch") return;
    const target = event.target as Element;
    if (
      target.closest(".react-flow__handle") ||
      target.closest(".react-flow__node-toolbar") ||
      target.closest("textarea")
    ) {
      return;
    }
    if (beginResize(event.clientX, event.clientY, event.pointerId)) {
      event.preventDefault();
      event.stopPropagation();
    }
  };

  const handlePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = resizeDragRef.current;
    if (!drag) return;
    if (event.buttons === 0) {
      endResize(event);
      return;
    }
    const flow = services.screenToFlowPosition({
      x: event.clientX,
      y: event.clientY,
    });
    commitResize(drag, flow);
  };

  const endResize = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = resizeDragRef.current;
    if (!drag) return;
    resizeDragRef.current = null;
    if (nodeElementRef.current?.hasPointerCapture(event.pointerId)) {
      nodeElementRef.current.releasePointerCapture(event.pointerId);
    }
    // Close the resize: resume history so the gesture is one undo step.
    services.onNodesChange([
      {
        type: "dimensions",
        id,
        resizing: false,
        dimensions: { width: drag.box.w, height: drag.box.h },
      },
    ]);
  };

  const handleBox = readBox();
  const handleWidth = handleBox?.w ?? SHAPE_SIZES[data.shape].width;
  const handleHeight = handleBox?.h ?? SHAPE_SIZES[data.shape].height;

  return (
    <div
      className="group relative h-full w-full text-sm"
      ref={nodeElementRef}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => {
        setIsHovered(false);
        setHoverCursor(null);
      }}
      onMouseMove={handleMouseMove}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={endResize}
      onPointerCancel={endResize}
      style={{ cursor: hoverCursor ?? undefined, touchAction: "none" }}
    >
      <ShapeSurface
        background={displayColor.background}
        color={displayColor.text}
        selected={selected}
        shape={data.shape}
      />
      {/* Connection points: 24x24 hit boxes with a small visible dot. The dot
          fades in when the node is hovered or when a connection is being
          dragged within snap distance (nearPoints), so target points reveal
          before the cursor has to land fully on the shape. Rendered after
          everything else so they sit above the outline-resize zones where
          they overlap. */}
      {CONNECTION_POINTS.map((connectionPoint) => {
        const { id: pointId, position, cornerClass } = connectionPoint;
        const { u: pointU, v: pointV } = connectionPointPosition(
          data.shape,
          handleWidth,
          handleHeight,
          connectionPoint,
        );
        return (
          <Handle
          className={`nodrag flex h-6 w-6 items-center justify-center rounded-full ${cornerClass}`}
          id={pointId}
          key={pointId}
          position={position}
          // The hit box itself must stay invisible: React Flow's default
          // handle styles (background + border) would render a visible
          // circle on every point at all times. Only the inner dot below
          // is ever drawn, and only on hover or drag proximity.
          style={{
            background: "transparent",
            border: "none",
            pointerEvents: "all",
            zIndex: 20,
            left: `${pointU * 100}%`,
            top: `${pointV * 100}%`,
            transform: "translate(-50%, -50%)",
          }}
          type="source"
        >
          <span
            aria-hidden="true"
            className="block h-2 w-2 rounded-full transition-opacity duration-150"
            style={{
              backgroundColor: "var(--text-primary)",
              border: "1.5px solid var(--bg-base)",
              opacity:
                showHoveredPoints ||
                services.reconnectTargetNodeId === id ||
                nearPoints.has(pointId)
                  ? 1
                  : 0,
            }}
          />
          </Handle>
        );
      })}
      {/* NodeToolbar renders only when this node is the sole selected node and
          keeps the swatches at a constant screen size above the node.
          nodrag/nopan/nowheel plus stopped pointer, mouse, click, wheel, and
          keyboard events keep toolbar use from dragging the node, panning the
          canvas, or reaching React Flow's global key handlers. */}
      <NodeToolbar
        className="nodrag nopan nowheel flex items-center gap-1.5 rounded-full border border-surface-border bg-surface px-2 py-1.5 shadow-lg"
        isVisible={selected}
        onClick={stopCanvasInteraction}
        onDoubleClick={stopCanvasInteraction}
        onKeyDown={stopCanvasInteraction}
        onPointerDown={stopCanvasInteraction}
        onMouseDown={stopCanvasInteraction}
        onWheel={stopCanvasInteraction}
      >
        {NODE_COLORS.map((pair) => (
          <ColorSwatch
            active={isColorActive(pair)}
            color={pair}
            key={pair.background}
            onSelect={updateColor}
          />
        ))}
      </NodeToolbar>
      {isEditing ? (
        <div
          className="nodrag nopan nowheel absolute inset-0 flex items-center justify-center px-3"
          onClick={stopCanvasInteraction}
          onDoubleClick={stopCanvasInteraction}
          onMouseDown={stopCanvasInteraction}
          onPointerDown={stopCanvasInteraction}
        >
          <textarea
            aria-label="Node label"
            className="nodrag nopan nowheel min-h-6 max-h-full w-full resize-none overflow-y-auto border-0 bg-transparent p-0 text-center text-sm leading-6 outline-none placeholder:text-copy-faint [field-sizing:content] focus:ring-0"
            maxLength={MAX_NODE_LABEL_LENGTH}
            onBlur={() => setIsEditing(false)}
            onChange={handleLabelChange}
            onKeyDown={handleTextareaKeyDown}
            placeholder={EMPTY_LABEL_PLACEHOLDER}
            ref={textareaRef}
            rows={1}
            value={draftLabel}
            style={{ color: displayColor.text }}
          />
        </div>
      ) : (
        <div
          className="absolute inset-0 flex items-center justify-center px-3 text-center"
          role="button"
          tabIndex={0}
          onDoubleClick={startEditing}
          onKeyDown={handleLabelKeyDown}
          aria-label={`Edit node label: ${data.label || EMPTY_LABEL_PLACEHOLDER}`}
          style={{
            color: data.label ? displayColor.text : "var(--text-faint)",
          }}
        >
          <span className="min-w-0 max-w-full max-h-full overflow-hidden whitespace-pre-wrap [overflow-wrap:anywhere]">
            {data.label || EMPTY_LABEL_PLACEHOLDER}
          </span>
        </div>
      )}
    </div>
  );
}

/** The registered node types for the shared canvas. */
export const canvasNodeTypes: NodeTypes = {
  canvasNode: CanvasNodeView,
};

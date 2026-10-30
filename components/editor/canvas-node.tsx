"use client";

import { type NodeProps, type NodeTypes } from "@xyflow/react";

import {
  DEFAULT_NODE_COLOR,
  SHAPE_SIZES,
  type CanvasNode,
  type CanvasNodeShape,
} from "@/types/canvas";

const SVG_SHAPE_STROKE = 2;

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

/**
 * Renderer for the shared canvas node type.
 *
 * Draws the node's shape (see `ShapeSurface`) with the label centered over it.
 * The wrapper's width and height come from the shape's drag payload; this
 * component renders inside that wrapper, so the shape fills it exactly.
 *
 * @param props - The React Flow node props for a `canvasNode` node.
 */
export function CanvasNodeView({ data, selected }: NodeProps<CanvasNode>) {
  return (
    <div className="relative h-full w-full text-sm">
      <ShapeSurface
        background={data.color.background}
        color={data.color.text}
        selected={selected}
        shape={data.shape}
      />
      <div
        className="absolute inset-0 flex items-center justify-center px-3 text-center"
        style={{ color: data.color.text }}
      >
        {data.label}
      </div>
    </div>
  );
}

/** The registered node types for the shared canvas. */
export const canvasNodeTypes: NodeTypes = {
  canvasNode: CanvasNodeView,
};

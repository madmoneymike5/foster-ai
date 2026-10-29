"use client";

import {
  Circle,
  Cylinder,
  Diamond,
  Hexagon,
  RectangleHorizontal,
  type LucideIcon,
} from "lucide-react";

import { NODE_SHAPES, type CanvasNodeShape } from "@/types/canvas";

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

const SHAPE_ICONS: Record<Exclude<CanvasNodeShape, "pill">, LucideIcon> = {
  rectangle: RectangleHorizontal,
  diamond: Diamond,
  circle: Circle,
  cylinder: Cylinder,
  hexagon: Hexagon,
};

function PillShapeIcon({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect
        height="10"
        rx="4"
        stroke="currentColor"
        strokeWidth="2"
        width="20"
        x="2"
        y="7"
      />
    </svg>
  );
}

function ShapeIcon({ shape }: { shape: CanvasNodeShape }) {
  if (shape === "pill") {
    return <PillShapeIcon className="h-5 w-5" />;
  }

  const Icon = SHAPE_ICONS[
    shape as Exclude<CanvasNodeShape, "pill">
  ];
  return <Icon className="h-5 w-5" />;
}

/**
 * The floating pill-shaped toolbar at the bottom-center of the canvas.
 *
 * Each icon button is an HTML5 drag source; dragging one puts the shape name
 * and its default size into the drop payload (see SHAPE_DRAG_MIME). The
 * canvas wrapper handles the drop — this component only starts drags.
 */
export function ShapePanel() {
  return (
    <div className="absolute bottom-5 left-1/2 z-10 flex -translate-x-1/2 items-center gap-1 rounded-full border border-surface-border bg-surface px-2 py-1.5 shadow-lg">
      {NODE_SHAPES.map((shape) => {
        return (
          <button
            aria-label={`Drag to add ${shape}`}
            className="flex h-9 w-9 cursor-grab items-center justify-center rounded-full text-copy-secondary hover:bg-subtle hover:text-copy-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand active:cursor-grabbing"
            draggable
            key={shape}
            onDragStart={(event) => {
              event.dataTransfer.effectAllowed = "copy";
              event.dataTransfer.setData(
                SHAPE_DRAG_MIME,
                JSON.stringify(SHAPE_SIZES[shape]),
              );
            }}
            title={`Add ${shape}`}
            type="button"
          >
            <ShapeIcon shape={shape} />
          </button>
        );
      })}
    </div>
  );
}

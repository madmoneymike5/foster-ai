"use client";

import {
  Circle,
  Cylinder,
  Diamond,
  Hexagon,
  RectangleHorizontal,
  type LucideIcon,
} from "lucide-react";

import {
  NODE_SHAPES,
  SHAPE_DRAG_MIME,
  SHAPE_SIZES,
  type CanvasNodeShape,
} from "@/types/canvas";

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

interface ShapePanelProps {
  /**
   * Creates a shape without dragging, from click or keyboard activation
   * (Enter/Space) of a toolbar button.
   */
  onCreate: (shape: CanvasNodeShape) => void;
}

/**
 * The floating pill-shaped toolbar at the bottom-center of the canvas.
 *
 * Each icon button is an HTML5 drag source; dragging one puts the shape name
 * and its default size into the drop payload (see SHAPE_DRAG_MIME), which the
 * canvas wrapper handles on drop. Buttons also activate on click and keyboard
 * (Enter/Space), creating the shape through `onCreate` — drag is not the only
 * path to adding a shape.
 */
export function ShapePanel({ onCreate }: ShapePanelProps) {
  return (
    <div className="absolute bottom-5 left-1/2 z-10 flex -translate-x-1/2 items-center gap-1 rounded-full border border-surface-border bg-surface px-2 py-1.5 shadow-lg">
      {NODE_SHAPES.map((shape) => {
        return (
          <button
            aria-label={`Add ${shape}`}
            className="flex h-9 w-9 cursor-grab items-center justify-center rounded-full text-copy-secondary hover:bg-subtle hover:text-copy-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand active:cursor-grabbing"
            draggable
            key={shape}
            onClick={() => onCreate(shape)}
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

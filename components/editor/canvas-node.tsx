"use client";

import { type NodeProps, type NodeTypes } from "@xyflow/react";

import type { CanvasNode, CanvasNodeShape } from "@/types/canvas";

interface ShapeGraphicProps {
  shape: CanvasNodeShape;
  backgroundColor: string;
  borderColor: string;
}

function ShapeGraphic({
  shape,
  backgroundColor,
  borderColor,
}: ShapeGraphicProps) {
  const commonProps = {
    fill: backgroundColor,
    stroke: borderColor,
    strokeWidth: 2,
    vectorEffect: "non-scaling-stroke" as const,
  };

  switch (shape) {
    case "diamond":
      return (
        <polygon
          {...commonProps}
          points="50,1 99,50 50,99 1,50"
        />
      );
    case "circle":
      return <circle {...commonProps} cx="50" cy="50" r="49" />;
    case "pill":
      // The viewBox is stretched to the 160×64 default size. These explicit
      // radii produce semicircular ends with flat horizontal and vertical
      // sections instead of an ellipse.
      return (
        <rect
          {...commonProps}
          height="98"
          rx="20"
          ry="50"
          width="98"
          x="1"
          y="1"
        />
      );
    case "cylinder":
      return (
        <>
          <path
            {...commonProps}
            d="M 1 15 C 1 7 99 7 99 15 V 85 C 99 93 1 93 1 85 Z"
          />
          <ellipse
            cx="50"
            cy="15"
            fill={backgroundColor}
            rx="49"
            ry="8"
            stroke={borderColor}
            strokeWidth="2"
            vectorEffect="non-scaling-stroke"
          />
        </>
      );
    case "hexagon":
      return (
        <polygon
          {...commonProps}
          points="25,1 75,1 99,50 75,99 25,99 1,50"
        />
      );
    case "rectangle":
      return <rect {...commonProps} x="1" y="1" width="98" height="98" rx="8" />;
  }
}

/**
 * Renderer for the shared canvas node type.
 *
 * Each supported shape is drawn with a simple inline SVG and the label is
 * centered above it. The node wrapper's width and height come from the
 * shape's drag payload; shape-specific visuals are intentionally lightweight
 * for this unit.
 *
 * @param props - The React Flow node props for a `canvasNode` node.
 */
export function CanvasNodeView({ data }: NodeProps<CanvasNode>) {
  return (
    <div className="relative h-full w-full text-sm">
      <svg
        aria-hidden="true"
        className="absolute inset-0 h-full w-full"
        preserveAspectRatio="none"
        viewBox="0 0 100 100"
      >
        <ShapeGraphic
          backgroundColor={data.color.background}
          borderColor={data.color.text}
          shape={data.shape}
        />
      </svg>
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

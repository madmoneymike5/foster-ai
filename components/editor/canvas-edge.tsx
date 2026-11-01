"use client";

import { useMutation } from "@liveblocks/react";
import {
  type ChangeEvent,
  type KeyboardEvent,
  type MouseEvent,
  type PointerEvent,
  type SyntheticEvent,
  type WheelEvent,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  EdgeLabelRenderer,
  getSmoothStepPath,
  type EdgeProps,
  type EdgeTypes,
} from "@xyflow/react";

import { cn } from "@/lib/utils";
import type { CanvasEdge } from "@/types/canvas";

/**
 * The wide transparent stroke that makes each edge easy to hover, select, and
 * double-click without making the visible line thicker.
 */
const EDGE_HIT_WIDTH = 24;
const EDGE_STROKE_WIDTH = 2;
const EDGE_MARKER_ID = "foster-canvas-edge-arrow";
const EDGE_MARKER_URL = `url(#${EDGE_MARKER_ID})`;
const EDGE_LABEL_HINT = "Add label";

/**
 * Shared SVG arrowhead for canvas edges, rendered once per canvas.
 *
 * Edge paths reference the marker by id (`url(#…)`), which resolves within the
 * same document, so a single hidden defs element serves every edge. The fill
 * uses the edge token so the arrow brightens with the line through the same
 * group opacity transition.
 */
export function CanvasEdgeArrowMarker() {
  return (
    <svg aria-hidden="true" className="pointer-events-none absolute h-0 w-0">
      <defs>
        <marker
          id={EDGE_MARKER_ID}
          markerHeight={12}
          markerUnits="userSpaceOnUse"
          markerWidth={12}
          orient="auto"
          refX={8}
          refY={5}
          viewBox="0 0 10 10"
        >
          <path d="M 0 1 L 9 5 L 0 9 z" fill="var(--edge-default)" />
        </marker>
      </defs>
    </svg>
  );
}

/**
 * Custom renderer for the `canvasEdge` edge type.
 *
 * Right-angle (smooth-step, zero corner radius) routing with a closed
 * arrowhead. The visible line is thin and token-colored; at rest the whole
 * edge is dimmed and brightens on hover or selection. A wide transparent
 * stroke underneath captures pointer interaction so the hit area stays large
 * while the visible line stays thin.
 *
 * Double-clicking the edge (its wide hit area, the saved label pill, or the
 * faint hint on an unlabeled active edge) opens a small pill-shaped input at
 * the path midpoint, provided by React Flow's `EdgeLabelRenderer` and
 * positioned from `getSmoothStepPath`'s label point. Blur, Enter, and Escape
 * all commit the draft through a Liveblocks mutation, so labels update for
 * every collaborator through the existing edge data flow.
 *
 * @param props - The React Flow edge props for a `canvasEdge` edge.
 */
export function CanvasEdgeView({
  id,
  data,
  selected,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
}: EdgeProps<CanvasEdge>) {
  const [isHovered, setIsHovered] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [draftLabel, setDraftLabel] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  // The SVG edge and the HTML label are rendered in different layers. These
  // refs let hover state survive the pointer's short trip between them.
  const edgeHoverRef = useRef<SVGGElement>(null);
  const edgeLabelRef = useRef<HTMLDivElement>(null);
  const label = data?.label ?? "";
  const isActive = isHovered || selected || isEditing;

  const updateLabel = useMutation(
    ({ storage }, nextLabel: string) => {
      storage
        .get("flow")
        ?.get("edges")
        .get(id)
        ?.get("data")
        ?.set("label", nextLabel);
    },
    [id],
  );

  useEffect(() => {
    if (!isEditing) return;
    inputRef.current?.focus();
    inputRef.current?.select();
  }, [isEditing]);

  const startEditing = () => {
    if (isEditing) return;
    setDraftLabel(label);
    setIsEditing(true);
  };
  const commitLabel = () => {
    if (!isEditing) return;
    updateLabel(draftLabel);
    setIsEditing(false);
  };
  const stopCanvasInteraction = (event: SyntheticEvent) => {
    event.stopPropagation();
  };
  const handleEdgeDoubleClick = (event: MouseEvent<SVGGElement>) => {
    // Double-clicking the line again while editing would reseed the draft and
    // lose the in-progress text, so the line stays inert during editing.
    if (isEditing) return;
    event.stopPropagation();
    startEditing();
  };
  const handleLabelKeyDown = (event: KeyboardEvent<HTMLSpanElement>) => {
    // Treat both label presentations as real controls for keyboard users.
    // Stopping propagation keeps Enter and Space away from canvas shortcuts.
    event.stopPropagation();
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    startEditing();
  };
  const handleHoverLeave = (event: {
    relatedTarget: EventTarget | null;
  }) => {
    // The label is portalled outside the SVG group. Keep the hint mounted when
    // the pointer is moving into that label, and clear hover only after the
    // pointer has left both the edge and the label.
    const nextTarget = event.relatedTarget;
    if (
      nextTarget instanceof Node &&
      (edgeHoverRef.current?.contains(nextTarget) ||
        edgeLabelRef.current?.contains(nextTarget))
    ) {
      return;
    }
    setIsHovered(false);
  };
  const handleInputChange = (event: ChangeEvent<HTMLInputElement>) => {
    setDraftLabel(event.target.value);
  };
  const handleInputKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    event.stopPropagation();
    if (event.key === "Enter" || event.key === "Escape") {
      event.preventDefault();
      commitLabel();
    }
  };
  const handleInputPointerDown = (event: PointerEvent<HTMLInputElement>) => {
    event.stopPropagation();
  };
  const handleInputWheel = (event: WheelEvent<HTMLInputElement>) => {
    event.stopPropagation();
  };

  // Right-angle routing: smooth-step with zero corner radius. labelX/labelY
  // are the path midpoint the library reports for label placement.
  const [path, labelX, labelY] = getSmoothStepPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
    borderRadius: 0,
  });

  return (
    <>
      <g
        className={cn(
          "transition-opacity duration-150",
          isActive ? "opacity-100" : "opacity-70",
        )}
        onDoubleClick={handleEdgeDoubleClick}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={handleHoverLeave}
        ref={edgeHoverRef}
      >
        {/* Wide invisible hit target: pointer-events "stroke" makes it
            hit-testable regardless of the transparent stroke. */}
        <path
          d={path}
          fill="none"
          stroke="transparent"
          style={{ pointerEvents: "stroke" }}
          strokeWidth={EDGE_HIT_WIDTH}
        />
        {/* Visible line; pointer-events none keeps hit testing on the wide
            stroke only. Inline style (not presentation attributes) so the
            token stroke cannot be overridden by library CSS rules. */}
        <path
          d={path}
          fill="none"
          markerEnd={EDGE_MARKER_URL}
          style={{
            pointerEvents: "none",
            stroke: "var(--edge-default)",
            strokeLinecap: "round",
            strokeWidth: EDGE_STROKE_WIDTH,
          }}
        />
      </g>
      <EdgeLabelRenderer>
        {/* The renderer layer is pointer-events: none; the inner div
            re-enables interaction and isolates it from canvas pan/drag via
            nodrag/nopan/nowheel plus stopped propagation. */}
        <div
          className="nodrag nopan nowheel"
          onMouseEnter={() => setIsHovered(true)}
          onMouseLeave={handleHoverLeave}
          ref={edgeLabelRef}
          style={{
            position: "absolute",
            pointerEvents: "all",
            transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
          }}
        >
          {isEditing ? (
            <input
              aria-label="Edge label"
              autoFocus
              className="nodrag nopan nowheel min-w-16 max-w-48 rounded-full border border-surface-border bg-surface px-2.5 py-1 text-xs text-copy-primary shadow-sm outline-none [field-sizing:content] focus-visible:ring-2 focus-visible:ring-brand"
              onBlur={commitLabel}
              onChange={handleInputChange}
              onDoubleClick={stopCanvasInteraction}
              onKeyDown={handleInputKeyDown}
              onPointerDown={handleInputPointerDown}
              onClick={stopCanvasInteraction}
              onWheel={handleInputWheel}
              ref={inputRef}
              value={draftLabel}
            />
          ) : label ? (
            <span
              aria-label={`Edit edge label: ${label}`}
              className="block max-w-48 truncate rounded-full border border-surface-border bg-surface px-2 py-0.5 text-[11px] leading-4 text-copy-secondary shadow-sm"
              onDoubleClick={startEditing}
              onKeyDown={handleLabelKeyDown}
              role="button"
              tabIndex={0}
            >
              {label}
            </span>
          ) : isActive ? (
            <span
              aria-label="Add edge label"
              className="block max-w-48 truncate rounded-full bg-base/80 px-2 py-0.5 text-[11px] leading-4 text-copy-faint"
              onDoubleClick={startEditing}
              onKeyDown={handleLabelKeyDown}
              role="button"
              tabIndex={0}
            >
              {EDGE_LABEL_HINT}
            </span>
          ) : null}
        </div>
      </EdgeLabelRenderer>
    </>
  );
}

/** The registered edge types for the shared canvas. */
export const canvasEdgeTypes: EdgeTypes = {
  canvasEdge: CanvasEdgeView,
};

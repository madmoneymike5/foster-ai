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
  useMemo,
  useRef,
  useState,
} from "react";
import {
  EdgeLabelRenderer,
  getSmoothStepPath,
  Position,
  type EdgeProps,
  type EdgeTypes,
  type Node,
  useNodes,
} from "@xyflow/react";

import { useCanvasServices } from "@/components/editor/canvas-context";
import {
  routeOrthogonalEdge,
  type ObstacleBox,
} from "@/components/editor/orthogonal-edge-router";
import { cn } from "@/lib/utils";
import type { CanvasEdge } from "@/types/canvas";

/**
 * The wide transparent stroke that makes each edge easy to hover, select, and
 * double-click without making the visible line thicker.
 */
const EDGE_HIT_WIDTH = 24;
const EDGE_STROKE_WIDTH = 2;
/**
 * The two translucent under-strokes behind a selected edge (outer/inner).
 * Layered strokes read as a soft glow at every zoom level without the
 * repaint cost of an SVG filter on content that pans and zooms.
 */
const GLOW_OUTER_WIDTH = 10;
const GLOW_OUTER_OPACITY = 0.15;
const GLOW_INNER_WIDTH = 5;
const GLOW_INNER_OPACITY = 0.3;
/** Drop snap radius for endpoint reconnection, in screen pixels. */
const RECONNECT_SNAP_PX = 24;
/** Reveal a candidate node before the pointer reaches any specific handle. */
const RECONNECT_TARGET_PREVIEW_PX = 48;
const EDGE_MARKER_ID = "foster-canvas-edge-arrow";
const EDGE_MARKER_URL = `url(#${EDGE_MARKER_ID})`;
const EDGE_LABEL_HINT = "Add label";

/** Unit outward normal for each side handle. */
const POSITION_NORMALS: Record<Position, [number, number]> = {
  [Position.Top]: [0, -1],
  [Position.Right]: [1, 0],
  [Position.Bottom]: [0, 1],
  [Position.Left]: [-1, 0],
};

/**
 * Corner handles leave their shape on a true 45-degree heading. Keeping the
 * vectors normalized makes the preferred stub length a real flow-pixel
 * distance rather than a larger diagonal measured per axis.
 */
const DIAGONAL = Math.SQRT1_2;
const HANDLE_NORMALS: Record<string, [number, number]> = {
  "corner-top-left": [-DIAGONAL, -DIAGONAL],
  "corner-top-right": [DIAGONAL, -DIAGONAL],
  "corner-bottom-left": [-DIAGONAL, DIAGONAL],
  "corner-bottom-right": [DIAGONAL, DIAGONAL],
};

function handleNormal(
  handleId: string | null | undefined,
  position: Position,
): [number, number] {
  return HANDLE_NORMALS[handleId ?? ""] ?? POSITION_NORMALS[position];
}

/** A node's raw bounding box in flow coordinates. */
function nodeObstacle(node: Node): ObstacleBox | null {
  const w = node.width ?? node.measured?.width;
  const h = node.height ?? node.measured?.height;
  if (!w || !h) return null;
  // Absolute flow position lives on the internal store node; the public
  // Node type only promises the relative `position`.
  const pos =
    (node as Node & { internals?: { positionAbsolute?: { x: number; y: number } } })
      .internals?.positionAbsolute ?? node.position;
  return { x: pos.x, y: pos.y, w, h };
}

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

/** Which end of an edge a reconnection drag is moving. */
type ReconnectEnd = "source" | "target";

interface ReconnectDrag {
  end: ReconnectEnd;
  /** The dragged endpoint's current position in flow coordinates. */
  point: { x: number; y: number };
}


/**
 * Resolve where a reconnection drag dropped: the handle under the cursor
 * (DOM hit test, which respects z-order and occlusion), falling back to the
 * nearest visible handle within the snap radius.
 *
 * @returns The handle's node id and handle id, or `null` when the drop missed
 *   every connection point.
 */
function nearestReconnectTarget(
  clientX: number,
  clientY: number,
  excludedNodeId: string,
): string | null {
  let nearest: { nodeId: string; distance: number } | null = null;
  for (const element of document.querySelectorAll<HTMLElement>(".react-flow__node")) {
    const nodeId =
      element.getAttribute("data-id") ??
      element.querySelector(".react-flow__handle")?.getAttribute("data-nodeid");
    if (!nodeId || nodeId === excludedNodeId) continue;
    const rect = element.getBoundingClientRect();
    const distanceX = Math.max(rect.left - clientX, 0, clientX - rect.right);
    const distanceY = Math.max(rect.top - clientY, 0, clientY - rect.bottom);
    const distance = Math.hypot(distanceX, distanceY);
    if (
      distance <= RECONNECT_TARGET_PREVIEW_PX &&
      (!nearest || distance < nearest.distance)
    ) {
      nearest = { nodeId, distance };
    }
  }
  return nearest?.nodeId ?? null;
}

function resolveDropHandle(
  clientX: number,
  clientY: number,
): { nodeId: string; handleId: string | null } | null {
  for (const el of document.elementsFromPoint(clientX, clientY)) {
    const handle = el.closest?.(".react-flow__handle");
    if (handle instanceof Element) {
      const nodeId = handle.getAttribute("data-nodeid");
      if (nodeId) {
        return { nodeId, handleId: handle.getAttribute("data-handleid") };
      }
    }
  }
  let best: { nodeId: string; handleId: string | null; dist: number } | null =
    null;
  const handles = document.querySelectorAll(".react-flow__handle");
  for (const el of handles) {
    const rect = el.getBoundingClientRect();
    const dist = Math.hypot(
      clientX - (rect.left + rect.width / 2),
      clientY - (rect.top + rect.height / 2),
    );
    if (dist > RECONNECT_SNAP_PX) continue;
    const nodeId = el.getAttribute("data-nodeid");
    if (!nodeId || (best && dist >= best.dist)) continue;
    best = { nodeId, handleId: el.getAttribute("data-handleid"), dist };
  }
  return best ? { nodeId: best.nodeId, handleId: best.handleId } : null;
}

/**
 * Custom renderer for the `canvasEdge` edge type.
 *
 * Right-angle (smooth-step, zero corner radius) routing with a closed
 * arrowhead. The visible line is thin and token-colored; at rest the whole
 * edge is dimmed and brightens on hover. A selected edge gets a layered
 * translucent under-stroke (a glow without SVG filters), and two small
 * endpoint handles appear at its ends: dragging one reattaches that end, and
 * the edge path — including its arrow and label — follows the pointer live,
 * then commits through a standard `replace` edge change on drop.
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
  source,
  target,
  sourceHandleId,
  targetHandleId,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
}: EdgeProps<CanvasEdge>) {
  const services = useCanvasServices();
  const { setReconnectActive, setReconnectTargetNodeId } = services;
  const [isHovered, setIsHovered] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [draftLabel, setDraftLabel] = useState("");
  const [reconnect, setReconnect] = useState<ReconnectDrag | null>(null);
  const reconnectTargetRef = useRef<string | null>(null);
  const reconnectOwnedRef = useRef(false);
  const inputRef = useRef<HTMLInputElement>(null);
  // The SVG edge and the HTML label live in different layers. Keeping refs to
  // both lets hover state survive the short pointer transition between them.
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
    if (isEditing || reconnect) return;
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
    if (isEditing || reconnect) return;
    event.stopPropagation();
    startEditing();
  };
  const handleLabelKeyDown = (event: KeyboardEvent<HTMLSpanElement>) => {
    // Edge labels are visually small, but they are still editable controls.
    // Enter and Space mirror the node-label keyboard behavior while stopping
    // the key event from reaching React Flow's canvas shortcuts.
    event.stopPropagation();
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    startEditing();
  };
  const handleHoverLeave = (event: {
    relatedTarget: EventTarget | null;
  }) => {
    // React Flow renders the edge as SVG and the label as an HTML portal.
    // Do not clear hover when the pointer is moving between those two parts;
    // otherwise the Add label hint unmounts before it can receive a click.
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

  /**
   * Start dragging one endpoint. The dot captures the pointer, so every
   * follow-up move/up arrives here even when the cursor leaves the dot —
   * which is exactly when the path must keep tracking.
   */
  const setReconnectTarget = (nodeId: string | null) => {
    if (reconnectTargetRef.current === nodeId) return;
    reconnectTargetRef.current = nodeId;
    services.setReconnectTargetNodeId(nodeId);
  };
  const clearReconnectTarget = () => setReconnectTarget(null);

  useEffect(
    () => () => {
      if (!reconnectOwnedRef.current) return;
      reconnectOwnedRef.current = false;
      reconnectTargetRef.current = null;
      setReconnectTargetNodeId(null);
      setReconnectActive(false);
    },
    [setReconnectActive, setReconnectTargetNodeId],
  );

  const startReconnect = (
    event: PointerEvent<HTMLElement>,
    end: ReconnectEnd,
  ) => {
    event.stopPropagation();
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    setIsEditing(false);
    clearReconnectTarget();
    services.setReconnectActive(true);
    reconnectOwnedRef.current = true;
    setReconnect({
      end,
      point:
        end === "source"
          ? { x: sourceX, y: sourceY }
          : { x: targetX, y: targetY },
    });
  };
  const handleReconnectMove = (
    event: PointerEvent<HTMLElement>,
    end: ReconnectEnd,
  ) => {
    if (!reconnect || reconnect.end !== end) return;
    const oppositeNodeId = end === "source" ? target : source;
    setReconnectTarget(
      nearestReconnectTarget(event.clientX, event.clientY, oppositeNodeId),
    );
    setReconnect((current) =>
      current
        ? {
            ...current,
            point: services.screenToFlowPosition({
              x: event.clientX,
              y: event.clientY,
            }),
          }
        : current,
    );
  };
  const handleReconnectUp = (
    event: PointerEvent<HTMLElement>,
    end: ReconnectEnd,
  ) => {
    if (!reconnect || reconnect.end !== end) return;
    event.preventDefault();
    event.stopPropagation();
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    const drop = resolveDropHandle(event.clientX, event.clientY);
    clearReconnectTarget();
    services.setReconnectActive(false);
    reconnectOwnedRef.current = false;
    setReconnect(null);
    if (!drop) return;
    // A self-loop would route the arrow into the edge's own start, so drops
    // on the node already attached to the opposite end cancel.
    if (end === "source" && drop.nodeId === target) return;
    if (end === "target" && drop.nodeId === source) return;
    services.onEdgesChange([
      {
        type: "replace",
        id,
        item: {
          id,
          source: end === "source" ? drop.nodeId : source,
          sourceHandle: end === "source" ? drop.handleId : sourceHandleId ?? null,
          target: end === "target" ? drop.nodeId : target,
          targetHandle: end === "target" ? drop.handleId : targetHandleId ?? null,
          type: "canvasEdge",
          data,
        },
      },
    ]);
  };
  const cancelReconnect = () => {
    clearReconnectTarget();
    services.setReconnectActive(false);
    reconnectOwnedRef.current = false;
    setReconnect(null);
  };

  // While an endpoint is dragged, the path follows the pointer live; the
  // opposite end stays anchored to its node.
  const effectiveSource =
    reconnect?.end === "source"
      ? reconnect.point
      : { x: sourceX, y: sourceY };
  const effectiveTarget =
    reconnect?.end === "target"
      ? reconnect.point
      : { x: targetX, y: targetY };

  // Obstacle-aware routing: the path runs around every other shape — and
  // around the anchored endpoints' own shapes — instead of behind them.
  // Node geometry is read reactively; the quantized signature below means
  // the A* only re-runs when the geometry changes by a visible amount.
  const nodes = useNodes();
  const sourceNormal =
    reconnect?.end === "source"
      ? null
      : handleNormal(sourceHandleId, sourcePosition);
  const targetNormal =
    reconnect?.end === "target"
      ? null
      : handleNormal(targetHandleId, targetPosition);
  // The node attached to a dragged end is not an obstacle: the free
  // endpoint may sit inside it while being pulled out.
  const dragFreeNode =
    reconnect?.end === "source"
      ? source
      : reconnect?.end === "target"
        ? target
        : null;
  const obstacleEntries = nodes
    .map((node) => ({ node, box: nodeObstacle(node) }))
    .filter((entry): entry is { node: Node; box: ObstacleBox } => entry.box !== null);
  const obstacleBoxes = obstacleEntries
    .filter(({ node }) => node.id !== dragFreeNode)
    .map(({ box }) => box);
  const sourceObstacle =
    reconnect?.end === "source"
      ? null
      : obstacleEntries.find(({ node }) => node.id === source)?.box ?? null;
  const targetObstacle =
    reconnect?.end === "target"
      ? null
      : obstacleEntries.find(({ node }) => node.id === target)?.box ?? null;

  const routeSignature = [
    `${Math.round(effectiveSource.x)},${Math.round(effectiveSource.y)}`,
    `${Math.round(effectiveTarget.x)},${Math.round(effectiveTarget.y)}`,
    sourceNormal ? sourceNormal.join(",") : "-",
    targetNormal ? targetNormal.join(",") : "-",
    ...obstacleBoxes.map(
      (b) =>
        `${Math.round(b.x)},${Math.round(b.y)},${Math.round(b.w)},${Math.round(b.h)}`,
    ),
  ].join("|");

  const routed = useMemo(
    () =>
      routeOrthogonalEdge({
        source: effectiveSource,
        target: effectiveTarget,
        sourceNormal,
        targetNormal,
        obstacles: obstacleBoxes,
        sourceObstacle,
        targetObstacle,
      }),
    // The signature quantizes every input to whole pixels, so routing only
    // re-runs when the geometry visibly changes; an unrelated re-render or
    // sub-pixel node movement reuses the cached path.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [routeSignature],
  );

  // labelX/labelY is the path midpoint. When no collision-free route
  // exists (e.g. overlapping nodes) fall back to the library's smooth step.
  const [path, labelX, labelY] = routed
    ? [routed.path, routed.labelPoint.x, routed.labelPoint.y]
    : getSmoothStepPath({
        sourceX: effectiveSource.x,
        sourceY: effectiveSource.y,
        targetX: effectiveTarget.x,
        targetY: effectiveTarget.y,
        sourcePosition,
        targetPosition,
        borderRadius: 0,
      });

  const endpointDotClass =
    "nodrag nopan nowheel block h-3 w-3 cursor-grab rounded-full active:cursor-grabbing";

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
        {/* Selected glow: two translucent strokes behind the line, same
            routing, low opacity. */}
        {selected && (
          <>
            <path
              d={path}
              fill="none"
              style={{
                pointerEvents: "none",
                stroke: "var(--edge-default)",
                strokeLinecap: "round",
                strokeWidth: GLOW_OUTER_WIDTH,
                opacity: GLOW_OUTER_OPACITY,
              }}
            />
            <path
              d={path}
              fill="none"
              style={{
                pointerEvents: "none",
                stroke: "var(--edge-default)",
                strokeLinecap: "round",
                strokeWidth: GLOW_INNER_WIDTH,
                opacity: GLOW_INNER_OPACITY,
              }}
            />
          </>
        )}
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
        {/* The renderer layer is pointer-events: none; the inner divs
            re-enable interaction and isolate it from canvas pan/drag via
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
        {/* Endpoint reconnection handles: shown only for the selected edge,
            in the label layer so they sit above the node layer. The moving
            dot rides the live path endpoint; both dots track the pointer
            through pointer capture. */}
        {selected && (
          <>
            <div
              className="nodrag nopan nowheel"
              style={{
                position: "absolute",
                pointerEvents: "all",
                zIndex: 100,
                transform: `translate(-50%, -50%) translate(${effectiveSource.x}px, ${effectiveSource.y}px)`,
              }}
            >
              <button
                aria-label="Drag to move this edge's start"
                className={endpointDotClass}
                onPointerDown={(event) => startReconnect(event, "source")}
                onPointerMove={(event) => handleReconnectMove(event, "source")}
                onPointerUp={(event) => handleReconnectUp(event, "source")}
                onPointerCancel={cancelReconnect}
                style={{
                  backgroundColor: "var(--edge-default)",
                  border: "2px solid var(--bg-base)",
                  boxShadow: "0 0 0 1px var(--border-subtle)",
                }}
                type="button"
              />
            </div>
            <div
              className="nodrag nopan nowheel"
              style={{
                position: "absolute",
                pointerEvents: "all",
                zIndex: 100,
                transform: `translate(-50%, -50%) translate(${effectiveTarget.x}px, ${effectiveTarget.y}px)`,
              }}
            >
              <button
                aria-label="Drag to move this edge's end"
                className={endpointDotClass}
                onPointerDown={(event) => startReconnect(event, "target")}
                onPointerMove={(event) => handleReconnectMove(event, "target")}
                onPointerUp={(event) => handleReconnectUp(event, "target")}
                onPointerCancel={cancelReconnect}
                style={{
                  backgroundColor: "var(--edge-default)",
                  border: "2px solid var(--bg-base)",
                  boxShadow: "0 0 0 1px var(--border-subtle)",
                }}
                type="button"
              />
            </div>
          </>
        )}
      </EdgeLabelRenderer>
    </>
  );
}

/** The registered edge types for the shared canvas. */
export const canvasEdgeTypes: EdgeTypes = {
  canvasEdge: CanvasEdgeView,
};

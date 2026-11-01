"use client";

import { useMutation } from "@liveblocks/react";
import {
  type ChangeEvent,
  type KeyboardEvent,
  type MouseEvent,
  type SyntheticEvent,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  Handle,
  NodeResizer,
  NodeToolbar,
  Position,
  type NodeProps,
  type NodeTypes,
  useKeyPress,
  useStoreApi,
} from "@xyflow/react";

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
 * Bound node labels before each Liveblocks write. A pasted multi-megabyte
 * value would otherwise be sent again on every subsequent keystroke.
 */
const MAX_NODE_LABEL_LENGTH = 256;

/**
 * The four connection handles around every node. All use the `source` type:
 * the canvas runs in `ConnectionMode.Loose`, so any handle can start a
 * connection and any same-typed handle on another node can end it.
 */
const CONNECTION_HANDLES = [
  { id: "top", position: Position.Top },
  { id: "right", position: Position.Right },
  { id: "bottom", position: Position.Bottom },
  { id: "left", position: Position.Left },
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

/**
 * Renderer for the shared canvas node type.
 *
 * Draws the node's shape (see `ShapeSurface`) with the label centered over it.
 * The wrapper's width and height come from the shape's drag payload; this
 * component renders inside that wrapper, so the shape fills it exactly.
 *
 * @param props - The React Flow node props for a `canvasNode` node.
 */
export function CanvasNodeView({ id, data, selected }: NodeProps<CanvasNode>) {
  const [isEditing, setIsEditing] = useState(false);
  const controlPressed = useKeyPress("Control", { preventDefault: false });
  const store = useStoreApi();
  const [draftLabel, setDraftLabel] = useState(data.label);
  const nodeElementRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
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
  // fields, not object identity. Normalize legacy values first so every node
  // still has one active swatch in the current palette.
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
    // maxLength handles normal browser input. Slicing here is still needed as
    // a storage boundary because pasted/programmatic values can bypass the
    // assumption that the browser already enforced the limit.
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
  const allowControlResize = (event: MouseEvent<HTMLDivElement>) => {
    if (
      !event.ctrlKey ||
      !(event.target instanceof Element) ||
      !event.target.closest(".react-flow__resize-control")
    ) {
      return;
    }

    // d3-drag rejects Ctrl+mousedown; keepAspectRatio already owns the modifier state.
    Object.defineProperty(event.nativeEvent, "ctrlKey", {
      configurable: true,
      value: false,
    });
  };
  const stopResizeSelection = (event: SyntheticEvent<HTMLDivElement>) => {
    if (
      event.target instanceof Element &&
      event.target.closest(".react-flow__resize-control")
    ) {
      event.stopPropagation();
    }
  };

  return (
    <div
      className="group relative h-full w-full text-sm"
      onClick={stopResizeSelection}
      ref={nodeElementRef}
      onMouseDownCapture={allowControlResize}
    >
      <ShapeSurface
        background={displayColor.background}
        color={displayColor.text}
        selected={selected}
        shape={data.shape}
      />
      {/* Connection handles: hidden until the node is hovered (group-hover
          fades them in). Rendered before NodeResizer so that on a selected
          node the resize controls sit above the dots they share edge
          midpoints with, keeping spec 14's eight resize grips fully usable. */}
      {CONNECTION_HANDLES.map(({ id: handleId, position }) => (
        <Handle
          className="nodrag h-2 w-2 rounded-full opacity-0 transition-opacity duration-150 group-hover:opacity-100"
          id={handleId}
          key={handleId}
          position={position}
          style={{
            backgroundColor: "var(--text-primary)",
            border: "1.5px solid var(--bg-base)",
          }}
          type="source"
        />
      ))}
      <NodeResizer
        isVisible={selected}
        minWidth={MIN_NODE_WIDTH}
        minHeight={MIN_NODE_HEIGHT}
        keepAspectRatio={controlPressed}
        handleStyle={{
          width: 8,
          height: 8,
          border: "1px solid var(--border-subtle)",
          borderRadius: "2px",
          backgroundColor: "var(--bg-elevated)",
        }}
        lineStyle={{
          borderColor: "var(--border-subtle)",
          opacity: 0.65,
        }}
      />
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

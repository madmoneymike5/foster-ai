"use client";

import {
  useCanRedo,
  useCanUndo,
  useRedo,
  useUndo,
} from "@liveblocks/react";
import { Panel, useReactFlow } from "@xyflow/react";
import { Maximize2, Minus, Plus, Redo2, Undo2 } from "lucide-react";
import { useCallback, type ReactNode } from "react";

import {
  useCanvasServices,
} from "@/components/editor/canvas-context";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  CANVAS_ZOOM_ANIMATION_MS,
  useKeyboardShortcuts,
} from "@/hooks/use-keyboard-shortcuts";
import type { CanvasEdge, CanvasNode } from "@/types/canvas";

/** Short animation (ms) for the fit-view action. */
const FIT_VIEW_ANIMATION_MS = 300;

const CONTROL_BUTTON_CLASS =
  "flex h-9 w-9 items-center justify-center rounded-full text-copy-secondary hover:bg-subtle hover:text-copy-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:cursor-not-allowed disabled:text-copy-faint disabled:hover:bg-transparent";

interface ControlButtonProps {
  /** Accessible label, also the tooltip text. */
  label: string;
  onClick: () => void;
  disabled?: boolean;
  icon: ReactNode;
}

function ControlButton({ label, onClick, disabled, icon }: ControlButtonProps) {
  // A disabled button swallows pointer events, so the tooltip could never
  // open: keep the native title as the fallback for that state.
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <button
            aria-label={label}
            className={CONTROL_BUTTON_CLASS}
            disabled={disabled}
            title={disabled ? label : undefined}
            type="button"
          />
        }
        onClick={onClick}
      >
        {icon}
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

/**
 * Floating pill control bar at the bottom-left of the canvas.
 *
 * Two groups separated by a thin divider: zoom out / fit view / zoom in
 * (React Flow viewport, short animation) and undo / redo (Liveblocks
 * history, dimmed while there is nothing to undo/redo). Mounting this as a
 * React Flow `Panel` keeps `useReactFlow` in scope for the zoom/fit actions
 * and wires the matching keyboard shortcuts through `useKeyboardShortcuts`;
 * `nodrag nopan nowheel` keep control-bar interaction from moving the canvas.
 */
export function CanvasControls() {
  const reactFlowInstance = useReactFlow<CanvasNode, CanvasEdge>();
  const { fitVisibleArea } = useCanvasServices();
  const undo = useUndo();
  const redo = useRedo();
  const canUndo = useCanUndo();
  const canRedo = useCanRedo();

  const handleZoomIn = useCallback(() => {
    void reactFlowInstance.zoomIn({ duration: CANVAS_ZOOM_ANIMATION_MS });
  }, [reactFlowInstance]);

  const handleZoomOut = useCallback(() => {
    void reactFlowInstance.zoomOut({ duration: CANVAS_ZOOM_ANIMATION_MS });
  }, [reactFlowInstance]);

  const handleFitView = useCallback(() => {
    // Fits into the visible strip between the floating sidebars (full pane
    // when none are open). Manual fit may zoom in to the normal React Flow
    // maximum so a small project does not sit in a large empty viewport.
    fitVisibleArea(FIT_VIEW_ANIMATION_MS, 2);
  }, [fitVisibleArea]);

  useKeyboardShortcuts({
    instance: reactFlowInstance,
    undo,
    redo,
  });

  return (
    <Panel
      className="nodrag nopan nowheel m-5 flex items-center gap-1 rounded-full border border-surface-border bg-surface px-2 py-1.5 shadow-lg"
      position="bottom-left"
    >
      <ControlButton
        icon={<Minus className="h-5 w-5" />}
        label="Zoom out"
        onClick={handleZoomOut}
      />
      <ControlButton
        icon={<Maximize2 className="h-5 w-5" />}
        label="Fit view"
        onClick={handleFitView}
      />
      <ControlButton
        icon={<Plus className="h-5 w-5" />}
        label="Zoom in"
        onClick={handleZoomIn}
      />
      <div aria-hidden="true" className="h-6 w-px bg-surface-border" />
      <ControlButton
        disabled={!canUndo}
        icon={<Undo2 className="h-5 w-5" />}
        label="Undo"
        onClick={undo}
      />
      <ControlButton
        disabled={!canRedo}
        icon={<Redo2 className="h-5 w-5" />}
        label="Redo"
        onClick={redo}
      />
    </Panel>
  );
}

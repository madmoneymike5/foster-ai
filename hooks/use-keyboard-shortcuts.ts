"use client";

import { useEffect, useRef } from "react";
import type { ReactFlowInstance } from "@xyflow/react";

import type { CanvasEdge, CanvasNode } from "@/types/canvas";

/**
 * Short viewport animation (ms) shared by the button and keyboard zoom/fit
 * actions so both paths feel the same.
 */
export const CANVAS_ZOOM_ANIMATION_MS = 200;

interface UseKeyboardShortcutsOptions {
  /** React Flow instance for zoom and select-all actions. */
  instance: ReactFlowInstance<CanvasNode, CanvasEdge>;
  /** Undo handler (Liveblocks history). */
  undo: () => void;
  /** Redo handler (Liveblocks history). */
  redo: () => void;
}

/**
 * True when the keydown originates from a field the user is typing in: an
 * input, a textarea, or any contenteditable element (including the inline
 * node and edge label editors on the canvas).
 */
function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;

  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target.isContentEditable
  );
}

/**
 * Wires the canvas keyboard shortcuts to a React Flow instance and the
 * Liveblocks undo/redo handlers:
 *
 * - `+` / `=` zooms in, `-` zooms out (short animation; bare keys only —
 *   modified combinations are left to the browser)
 * - `Cmd/Ctrl+Z` undoes; `Cmd/Ctrl+Shift+Z` and `Cmd/Ctrl+Y` redo
 * - `Ctrl+A` selects all nodes (selection stays local per client, matching
 *   the Liveblocks flow adapter's select handling)
 *
 * All shortcuts are ignored while focus is inside an input, textarea, or
 * editable text field, so typing a node or edge label never triggers them.
 *
 * @param options.instance - React Flow instance for zoom and select-all.
 * @param options.undo - Called on the undo shortcut (Liveblocks history).
 * @param options.redo - Called on the redo shortcut (Liveblocks history).
 */
export function useKeyboardShortcuts({
  instance,
  undo,
  redo,
}: UseKeyboardShortcutsOptions): void {
  // The useReactFlow() instance object and the Liveblocks history hook
  // functions are recreated across renders, but the window listener only
  // needs to attach once — always read the latest values at event time.
  const instanceRef = useRef(instance);
  const undoRef = useRef(undo);
  const redoRef = useRef(redo);

  useEffect(() => {
    instanceRef.current = instance;
    undoRef.current = undo;
    redoRef.current = redo;
  }, [instance, undo, redo]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (isEditableTarget(event.target)) return;

      const flow = instanceRef.current;
      const modifier = event.metaKey || event.ctrlKey;

      if (modifier && event.key.toLowerCase() === "z") {
        event.preventDefault();
        if (event.shiftKey) {
          redoRef.current();
        } else {
          undoRef.current();
        }
        return;
      }

      if (modifier && !event.shiftKey && event.key.toLowerCase() === "y") {
        event.preventDefault();
        redoRef.current();
        return;
      }

      // Select-all is Ctrl+A per the spec (no Cmd variant).
      if (event.ctrlKey && !event.metaKey && event.key.toLowerCase() === "a") {
        event.preventDefault();
        flow.setNodes((nodes) =>
          nodes.map((node) =>
            node.selected ? node : { ...node, selected: true },
          ),
        );
        return;
      }

      // Bare zoom keys only: Cmd/Ctrl combinations are browser page-zoom.
      if (modifier) return;

      if (event.key === "+" || event.key === "=") {
        void flow.zoomIn({ duration: CANVAS_ZOOM_ANIMATION_MS });
        return;
      }

      if (event.key === "-") {
        void flow.zoomOut({ duration: CANVAS_ZOOM_ANIMATION_MS });
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);
}

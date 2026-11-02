"use client";

import { LayoutTemplate } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  CANVAS_TEMPLATES,
  type CanvasTemplate,
} from "@/components/editor/starter-templates";
import {
  SHAPE_SIZES,
  type CanvasNodeShape,
} from "@/types/canvas";

interface StarterTemplatesModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called with the chosen template; the modal then closes itself. */
  onImport: (template: CanvasTemplate) => void;
}

/** Fixed logical size of the diagram preview, independent of card width. */
const PREVIEW_W = 240;
const PREVIEW_H = 120;
const PREVIEW_PAD = 10;

interface PlacedNode {
  id: string;
  shape: CanvasNodeShape;
  background: string;
  text: string;
  x: number;
  y: number;
  w: number;
  h: number;
  cx: number;
  cy: number;
}

/**
 * Projects a template's node/edge geometry into the fixed preview viewport.
 *
 * Bounds are computed from each node's position and shape size; everything is
 * scaled to fit with padding and centered, so the preview is a faithful,
 * self-contained miniature with no React Flow instance.
 */
function layoutTemplate(template: CanvasTemplate) {
  const raw = template.nodes.map((node) => {
    const size = SHAPE_SIZES[node.data.shape];
    return {
      id: node.id,
      shape: node.data.shape,
      background: node.data.color.background,
      text: node.data.color.text,
      x: node.position.x,
      y: node.position.y,
      w: size.width,
      h: size.height,
    };
  });

  const minX = Math.min(...raw.map((n) => n.x));
  const minY = Math.min(...raw.map((n) => n.y));
  const maxX = Math.max(...raw.map((n) => n.x + n.w));
  const maxY = Math.max(...raw.map((n) => n.y + n.h));
  const boundsW = Math.max(maxX - minX, 1);
  const boundsH = Math.max(maxY - minY, 1);

  const scale = Math.min(
    (PREVIEW_W - 2 * PREVIEW_PAD) / boundsW,
    (PREVIEW_H - 2 * PREVIEW_PAD) / boundsH,
  );
  const padX = (PREVIEW_W - boundsW * scale) / 2;
  const padY = (PREVIEW_H - boundsH * scale) / 2;

  const placed: PlacedNode[] = raw.map((n) => {
    const x = padX + (n.x - minX) * scale;
    const y = padY + (n.y - minY) * scale;
    const w = n.w * scale;
    const h = n.h * scale;
    return { ...n, x, y, w, h, cx: x + w / 2, cy: y + h / 2 };
  });

  return { placed, byId: new Map(placed.map((n) => [n.id, n])) };
}

/** Renders a single node as its shape, using the stored fill and text colors. */
function shapeElement(
  node: PlacedNode,
  key: string,
): React.ReactElement {
  const { shape, x, y, w, h, background, text } = node;
  const cx = x + w / 2;
  const cy = y + h / 2;
  const common = { fill: background, stroke: text, strokeWidth: 1 };

  let element: React.ReactElement;
  switch (shape) {
    case "circle":
      element = (
        <ellipse cx={cx} cy={cy} rx={w / 2} ry={h / 2} {...common} />
      );
      break;
    case "diamond":
      element = (
        <polygon
          points={`${cx},${y} ${x + w},${cy} ${cx},${y + h} ${x},${cy}`}
          {...common}
        />
      );
      break;
    case "hexagon": {
      const inset = w * 0.15;
      element = (
        <polygon
          points={`${x + inset},${y} ${x + w - inset},${y} ${x + w},${cy} ${
            x + w - inset
          },${y + h} ${x + inset},${y + h} ${x},${cy}`}
          {...common}
        />
      );
      break;
    }
    case "pill":
      element = <rect x={x} y={y} width={w} height={h} rx={h / 2} {...common} />;
      break;
    case "cylinder": {
      // Mirrors the 0-100 viewBox geometry in canvas-node.tsx, scaled to the
      // preview box: curved body path plus the top ellipse rim.
      const sx = (v: number) => x + (v / 100) * w;
      const sy = (v: number) => y + (v / 100) * h;
      element = (
        <>
          <path
            d={`M ${sx(1)} ${sy(15)} C ${sx(1)} ${sy(7)} ${sx(99)} ${sy(7)} ${sx(99)} ${sy(15)} V ${sy(85)} C ${sx(99)} ${sy(93)} ${sx(1)} ${sy(93)} ${sx(1)} ${sy(85)} Z`}
            {...common}
          />
          <ellipse cx={sx(50)} cy={sy(15)} rx={w * 0.49} ry={h * 0.08} {...common} />
        </>
      );
      break;
    }
    default:
      element = <rect x={x} y={y} width={w} height={h} rx={3} {...common} />;
  }

  return <g key={key}>{element}</g>;
}

/** A lightweight, self-contained diagram preview (no React Flow instance). */
function TemplatePreview({ template }: { template: CanvasTemplate }) {
  const { placed, byId } = layoutTemplate(template);

  return (
    <svg
      viewBox={`0 0 ${PREVIEW_W} ${PREVIEW_H}`}
      className="h-auto w-full"
      aria-hidden="true"
    >
      {template.edges.map((edge) => {
        const source = byId.get(edge.source);
        const target = byId.get(edge.target);
        if (!source || !target) return null;
        return (
          <line
            key={edge.id}
            x1={source.cx}
            y1={source.cy}
            x2={target.cx}
            y2={target.cy}
            stroke="var(--edge-default)"
            strokeWidth={1}
            opacity={0.45}
          />
        );
      })}
      {placed.map((node) => shapeElement(node, node.id))}
    </svg>
  );
}

interface TemplateCardProps {
  template: CanvasTemplate;
  onImport: () => void;
}

function TemplateCard({ template, onImport }: TemplateCardProps) {
  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-surface-border bg-surface p-3">
      <div className="overflow-hidden rounded-xl border border-surface-border bg-base p-2">
        <TemplatePreview template={template} />
      </div>
      <div className="flex flex-col gap-1">
        <h3 className="text-sm font-medium text-copy-primary">
          {template.name}
        </h3>
        <p className="text-xs leading-relaxed text-copy-muted">
          {template.description}
        </p>
      </div>
      <Button
        variant="outline"
        size="sm"
        className="mt-auto"
        onClick={onImport}
      >
        <LayoutTemplate className="h-4 w-4" />
        Import
      </Button>
    </div>
  );
}

/**
 * Dialog listing the starter templates in a scrollable grid. Selecting a
 * template's Import button calls `onImport` with that template, then closes.
 *
 * @param open - Controls visibility.
 * @param onOpenChange - Called when the dialog opens or closes.
 * @param onImport - Receives the chosen template before the dialog closes.
 */
export function StarterTemplatesModal({
  open,
  onOpenChange,
  onImport,
}: StarterTemplatesModalProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[80vh] flex-col sm:max-w-2xl rounded-3xl">
        <DialogHeader>
          <DialogTitle>Starter templates</DialogTitle>
          <DialogDescription>
            Import a prebuilt diagram. If the canvas already has content,
            you can replace it, add to the project, or start a new project.
          </DialogDescription>
        </DialogHeader>
        <div className="grid min-h-0 grid-cols-1 gap-3 overflow-y-auto pr-1 sm:grid-cols-2">
          {CANVAS_TEMPLATES.map((template) => (
            <TemplateCard
              key={template.id}
              template={template}
              onImport={() => {
                onImport(template);
                onOpenChange(false);
              }}
            />
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}

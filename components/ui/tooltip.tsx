"use client";

import { Tooltip as TooltipPrimitive } from "@base-ui/react/tooltip";

import { cn } from "@/lib/utils";

/**
 * Shared tooltip open delay (ms). A little shorter than Base UI's 600ms
 * default so icon-button tooltips feel responsive without flickering.
 */
const TOOLTIP_DELAY = 300;

/**
 * Tooltip provider for a group of triggers. Neighbouring tooltips open
 * instantly when the pointer moves between them within the group timeout.
 *
 * @param props.delay - Open delay override (ms).
 * @param props.children - The triggers sharing this delay/group.
 */
function TooltipProvider({
  delay = TOOLTIP_DELAY,
  children,
  ...props
}: TooltipPrimitive.Provider.Props) {
  return (
    <TooltipPrimitive.Provider
      data-slot="tooltip-provider"
      delay={delay}
      {...props}
    >
      {children}
    </TooltipPrimitive.Provider>
  );
}

/**
 * A tooltip: wrap a trigger (via `TooltipTrigger`) with a `TooltipContent`.
 * The open delay comes from the nearest `TooltipProvider` (the editor shell
 * mounts one); without a provider Base UI's 600ms default applies.
 */
function Tooltip(props: TooltipPrimitive.Root.Props) {
  return <TooltipPrimitive.Root data-slot="tooltip" {...props} />;
}

/**
 * The hover target. Renders a button by default; use the `render` prop to
 * composite over an existing element (e.g. a shadcn Button).
 */
function TooltipTrigger(
  props: TooltipPrimitive.Trigger.Props & { children?: React.ReactNode },
) {
  return <TooltipPrimitive.Trigger data-slot="tooltip-trigger" {...props} />;
}

/**
 * The tooltip pill. Portaled above the app; positioned by the primitive's
 * Positioner (defaults: top, centered, 6px offset).
 *
 * @param props.className - Extra classes merged into the pill.
 * @param props.side - Preferred edge of the trigger to appear on.
 * @param props.sideOffset - Distance (px) from the trigger edge.
 * @param props.children - The tooltip text.
 */
function TooltipContent({
  className,
  side = "top",
  sideOffset = 6,
  children,
  ...props
}: TooltipPrimitive.Popup.Props & {
  side?: TooltipPrimitive.Positioner.Props["side"];
  sideOffset?: number;
}) {
  return (
    <TooltipPrimitive.Portal>
      <TooltipPrimitive.Positioner
        align="center"
        side={side}
        sideOffset={sideOffset}
        className="isolate z-50"
      >
        <TooltipPrimitive.Popup
          data-slot="tooltip-content"
          role="tooltip"
          className={cn(
            "fade-in-0 zoom-in-95 slide-in-from-top-2 animate-in select-none rounded-md border border-surface-border bg-surface px-2.5 py-1 text-xs text-copy-primary shadow-lg outline-none",
            className,
          )}
          {...props}
        >
          {children}
        </TooltipPrimitive.Popup>
      </TooltipPrimitive.Positioner>
    </TooltipPrimitive.Portal>
  );
}

export {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
  TOOLTIP_DELAY,
};

"use client";

import { X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface AiSidebarProps {
  isOpen: boolean;
  onClose: () => void;
}

/**
 * The floating AI sidebar (spec 08 placeholder; spec 20 fills in the header,
 * tabs, and chat UI). Controlled by the parent and positioned the same way as
 * the projects sidebar: an absolutely positioned overlay that slides in from
 * the right over the canvas and never pushes page content.
 */
export function AiSidebar({ isOpen, onClose }: AiSidebarProps) {
  return (
    <aside
      inert={!isOpen}
      aria-hidden={!isOpen}
      className={cn(
        "absolute inset-y-0 right-0 z-40 w-80 transform border-l border-surface-border bg-base/95 backdrop-blur transition-transform duration-200 ease-out motion-reduce:transition-none",
        isOpen ? "translate-x-0" : "translate-x-full"
      )}
    >
      <div className="flex h-full flex-col">
        <div className="flex items-center justify-between border-b border-surface-border px-4 py-3">
          <h2 className="text-sm font-semibold text-copy-primary">AI Assistant</h2>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Close AI sidebar"
            onClick={onClose}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
        <div className="flex flex-1 items-center justify-center p-6">
          <p className="text-center text-sm text-copy-muted">AI chat will live here.</p>
        </div>
      </div>
    </aside>
  );
}

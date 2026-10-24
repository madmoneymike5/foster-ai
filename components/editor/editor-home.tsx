"use client";

import { Plus } from "lucide-react";

import { Button } from "@/components/ui/button";

interface EditorHomeProps {
  onNewProject: () => void;
}

/**
 * The empty-state home shown in the center of `/editor` before a project is
 * open. Intentionally minimal — plain stacked content, no cards.
 */
export function EditorHome({ onNewProject }: EditorHomeProps) {
  return (
    <div className="flex flex-col items-center gap-3 text-center">
      <h1 className="text-2xl font-semibold text-copy-primary">
        Create a project or open an existing one
      </h1>
      <p className="text-copy-muted">
        Start a new architecture workspace, or choose a project from the sidebar.
      </p>
      <Button className="mt-2" onClick={onNewProject}>
        <Plus data-icon="inline-start" className="h-4 w-4" />
        New Project
      </Button>
    </div>
  );
}

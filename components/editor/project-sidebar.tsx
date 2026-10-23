"use client";

import { Folder, Plus, Users, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

interface ProjectSidebarProps {
  isOpen: boolean;
  onClose: () => void;
  onNewProject?: () => void;
}

interface EmptyStateProps {
  icon: React.ReactNode;
  label: string;
}

function EmptyState({ icon, label }: EmptyStateProps) {
  return (
    <div className="flex h-full min-h-48 flex-col items-center justify-center gap-3">
      <span className="text-copy-faint">{icon}</span>
      <p className="text-sm text-copy-muted">{label}</p>
    </div>
  );
}

export function ProjectSidebar({
  isOpen,
  onClose,
  onNewProject,
}: ProjectSidebarProps) {
  return (
    <aside
      inert={!isOpen}
      aria-hidden={!isOpen}
      className={cn(
        "absolute inset-y-0 left-0 z-40 w-80 transform border-r border-surface-border bg-surface/95 backdrop-blur transition-transform duration-200 ease-out motion-reduce:transition-none",
        isOpen ? "translate-x-0" : "-translate-x-full"
      )}
    >
      <div className="flex h-full flex-col">
        <div className="flex items-center justify-between border-b border-surface-border px-4 py-3">
          <h2 className="text-sm font-semibold text-copy-primary">Projects</h2>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Close projects sidebar"
            onClick={onClose}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        <Tabs defaultValue="my-projects" className="flex flex-1 gap-4 overflow-y-auto p-4">
          <TabsList className="w-full">
            <TabsTrigger value="my-projects">My Projects</TabsTrigger>
            <TabsTrigger value="shared">Shared</TabsTrigger>
          </TabsList>
          <TabsContent value="my-projects" className="min-h-0 flex-1">
            <EmptyState
              icon={<Folder className="h-8 w-8" />}
              label="No projects yet."
            />
          </TabsContent>
          <TabsContent value="shared" className="min-h-0 flex-1">
            <EmptyState
              icon={<Users className="h-8 w-8" />}
              label="No shared projects yet."
            />
          </TabsContent>
        </Tabs>

        <div className="border-t border-surface-border p-4">
          <Button className="w-full" disabled={!onNewProject} onClick={onNewProject}>
            <Plus data-icon="inline-start" className="h-4 w-4" />
            New Project
          </Button>
        </div>
      </div>
    </aside>
  );
}

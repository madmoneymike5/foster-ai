"use client";

import { useRouter } from "next/navigation";
import { Pencil, Plus, Trash2, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { ProjectListItem } from "@/lib/projects";
import { cn } from "@/lib/utils";

interface ProjectSidebarProps {
  isOpen: boolean;
  onClose: () => void;
  ownedProjects: ProjectListItem[];
  sharedProjects: ProjectListItem[];
  onNewProject?: () => void;
  onRenameProject?: (project: ProjectListItem) => void;
  onDeleteProject?: (project: ProjectListItem) => void;
}

interface ProjectItemProps {
  project: ProjectListItem;
  onRename?: (project: ProjectListItem) => void;
  onDelete?: (project: ProjectListItem) => void;
}

/**
 * One row in the project list. Clicking the name opens the project's workspace
 * at /editor/[roomId]. Rename and delete actions render only for owned
 * projects — shared/collaborator rows are display-only.
 */
function ProjectItem({ project, onRename, onDelete }: ProjectItemProps) {
  const router = useRouter();
  const showActions = !project.isShared && Boolean(onRename || onDelete);

  return (
    <li className="flex items-center gap-1">
      <Button
        variant="ghost"
        className="h-auto flex-1 truncate justify-start px-1 py-1.5 text-sm text-copy-secondary hover:text-copy-primary"
        title={project.name}
        onClick={() => router.push(`/editor/${project.id}`)}
      >
        <span className="truncate">{project.name}</span>
      </Button>
      {showActions && (
        <span className="flex shrink-0 items-center">
          {onRename && (
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={`Rename ${project.name}`}
              className="text-copy-faint hover:text-copy-primary"
              onClick={() => onRename(project)}
            >
              <Pencil className="h-3.5 w-3.5" />
            </Button>
          )}
          {onDelete && (
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={`Delete ${project.name}`}
              className="text-copy-faint hover:text-state-error"
              onClick={() => onDelete(project)}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          )}
        </span>
      )}
    </li>
  );
}

interface ProjectListProps {
  projects: ProjectListItem[];
  onRename?: (project: ProjectListItem) => void;
  onDelete?: (project: ProjectListItem) => void;
}

/**
 * Render a project collection with optional owner-only row actions.
 * Shared-project callers omit both callbacks so collaborator rows remain read-only.
 */
function ProjectList({ projects, onRename, onDelete }: ProjectListProps) {
  return (
    <ul className="flex flex-col gap-0.5">
      {projects.map((project) => (
        <ProjectItem
          key={project.id}
          project={project}
          onRename={onRename}
          onDelete={onDelete}
        />
      ))}
    </ul>
  );
}

/**
 * The slide-in projects sidebar: server-fetched owned and shared project lists,
 * per-row rename/delete actions for owned projects, and a mobile backdrop scrim
 * that closes the sidebar when tapped.
 */
export function ProjectSidebar({
  isOpen,
  onClose,
  ownedProjects,
  sharedProjects,
  onNewProject,
  onRenameProject,
  onDeleteProject,
}: ProjectSidebarProps) {
  return (
    <>
      {/* Mobile scrim: tapping outside the sidebar closes it (spec 04). */}
      {isOpen && (
        <button
          type="button"
          aria-label="Close projects sidebar"
          className="absolute inset-0 z-30 bg-black/40 md:hidden"
          onClick={onClose}
        />
      )}
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
              <ProjectList
                projects={ownedProjects}
                onRename={onRenameProject}
                onDelete={onDeleteProject}
              />
            </TabsContent>
            <TabsContent value="shared" className="min-h-0 flex-1">
              <ProjectList projects={sharedProjects} />
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
    </>
  );
}

"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { AiSidebar } from "@/components/editor/ai-sidebar";
import { EditorNavbar } from "@/components/editor/editor-navbar";
import { LiveCanvas } from "@/components/editor/live-canvas";
import { EditorHome } from "@/components/editor/editor-home";
import { ProjectDialogs } from "@/components/editor/project-dialogs";
import { ProjectSidebar } from "@/components/editor/project-sidebar";
import { ShareDialog } from "@/components/editor/share-dialog";
import { StarterTemplatesModal } from "@/components/editor/starter-templates-modal";
import {
  getTemplateById,
  withRemappedIds,
  type CanvasImportRequest,
} from "@/components/editor/starter-templates";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useProjectActions } from "@/hooks/use-project-actions";
import type { ProjectListItem } from "@/lib/projects";

/**
 * The floating sidebars are 20rem (w-80) wide; when open, that much of the
 * canvas edge is covered, and the zoom-fit treats it as unavailable work
 * area (fitting into the visible strip between the open panels instead).
 */
const SIDEBAR_WIDTH_PX = 320;

interface EditorWorkspaceProps {
  ownedProjects: ProjectListItem[];
  sharedProjects: ProjectListItem[];
  /** The open project on /editor/[roomId]; absent on the /editor home. */
  activeProject?: ProjectListItem;
  /**
   * A starter template carried in the URL after a "new project + import"
   * creation; imported into the (empty) room on mount, then stripped from
   * the URL.
   */
  starterTemplateId?: string;
}

/**
 * The editor shell: navbar, slide-in projects sidebar, and the center area.
 *
 * The project lists are fetched server-side (see app/editor/page.tsx and
 * app/editor/[roomId]/page.tsx) and passed in as props — no client-side
 * fetching. This component owns the sidebar open/closed state and the
 * useProjectActions hook that wires the home button, the sidebar rows, and
 * every dialog to the project API.
 *
 * With an active project the shell is the full-viewport workspace: the
 * navbar carries the project name plus share and AI-sidebar actions, the
 * sidebar highlights the current room, the center holds the canvas, and the
 * AI sidebar floats on the right.
 *
 * Starter template imports: a modal selection becomes a one-shot request
 * (`mode: "ask"`) that the canvas applies directly on an empty canvas and
 * hands back as a conflict on a non-empty one; the conflict dialog offers
 * replace, add to project, or new project (which creates the project and
 * carries the template into it via the URL).
 */
export function EditorWorkspace({
  ownedProjects,
  sharedProjects,
  activeProject,
  starterTemplateId,
}: EditorWorkspaceProps) {
  const router = useRouter();
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  // The AI sidebar only exists in a workspace; it opens by default there so
  // the placeholder is visible on first load.
  const [isAiSidebarOpen, setIsAiSidebarOpen] = useState(Boolean(activeProject));
  // The share dialog only exists for an active workspace; ownership is
  // derived from the server-decided isShared flag (a shared row means the
  // caller is a collaborator, not the owner).
  const [isShareOpen, setIsShareOpen] = useState(false);
  // Starter template import: the modal is workspace-only, and the selected
  // template travels to the canvas as a one-shot request (a fresh requestId
  // per selection) that LiveCanvas applies to the active room once.
  const [isStarterTemplatesOpen, setIsStarterTemplatesOpen] = useState(false);
  const [pendingImport, setPendingImport] = useState<
    (CanvasImportRequest & { projectId: string }) | null
  >(null);
  // A pending import the canvas reported a conflict for (non-empty canvas
  // under an `ask` request); the dialog below chooses how to proceed.
  const [conflictImport, setConflictImport] = useState<
    (CanvasImportRequest & { projectId: string }) | null
  >(null);
  // The last acknowledged import (request id + imported node ids), which the
  // canvas uses for its post-import fit.
  const [appliedImport, setAppliedImport] = useState<{
    requestId: string;
    nodeIds: string[];
  } | null>(null);
  // The canvas acknowledges through a stable callback, so the pending import
  // it is reacting to is read from a ref rather than a closure. Every write
  // site updates the ref *synchronously* (not only in the effect below):
  // child effects run before this component's, so the canvas's import effect
  // fires before this render's ref-mirror effect could have run.
  const pendingImportRef = useRef(pendingImport);
  useEffect(() => {
    pendingImportRef.current = pendingImport;
  }, [pendingImport]);

  const handleTemplateImported = useCallback((requestId: string) => {
    const current = pendingImportRef.current;
    if (!current || current.requestId !== requestId) return;
    // Node ids are deterministic per mode + requestId, so they can be
    // derived here instead of reported back by the canvas: an added
    // template's ids are the remapped ones, a replacement's the template's.
    const nodeIds =
      current.mode === "add"
        ? withRemappedIds(current.requestId, current.template).nodeIds
        : current.template.nodes.map((node) => node.id);
    setAppliedImport({ requestId, nodeIds });
    setPendingImport(null);
  }, []);
  const handleImportConflict = useCallback(
    (request: CanvasImportRequest) => {
      const current = pendingImportRef.current;
      if (!current || current.requestId !== request.requestId) return;
      setConflictImport(current);
    },
    [],
  );
  // A pending import belongs to the room it was selected in; deriving the
  // canvas prop this way keeps a stale request from ever reaching a
  // different room. A URL-carried template (from a new project creation)
  // is adopted the same way, as a deterministic replace-mode request.
  const urlImport = useMemo<
    (CanvasImportRequest & { projectId: string }) | null
  >(() => {
    if (!starterTemplateId || !activeProject) return null;
    const template = getTemplateById(starterTemplateId);
    if (!template) return null;
    return {
      requestId: `url-${starterTemplateId}-${activeProject.id}`,
      template,
      mode: "replace",
      projectId: activeProject.id,
    };
  }, [starterTemplateId, activeProject]);
  const importRequest =
    pendingImport?.projectId === activeProject?.id
      ? pendingImport
      : urlImport?.projectId === activeProject?.id
        ? urlImport
        : null;
  // Strip the starter template param once the workspace has it; the derived
  // request is idempotent (a stable requestId), so removing the param cannot
  // drop or duplicate the import.
  useEffect(() => {
    if (!starterTemplateId || !activeProject) return;
    router.replace(`/editor/${activeProject.id}`);
  }, [starterTemplateId, activeProject, router]);
  const actions = useProjectActions();

  /** Answer the import conflict with an explicit-mode follow-up request. */
  const proceedWithImport = (mode: "replace" | "add") => {
    const conflict = conflictImport;
    setConflictImport(null);
    if (!conflict) return;
    const request = {
      requestId: crypto.randomUUID(),
      template: conflict.template,
      mode,
      projectId: conflict.projectId,
    };
    pendingImportRef.current = request;
    setPendingImport(request);
  };
  /**
   * "New project" in the conflict dialog: create a fresh project first, then
   * carry the template into it via the URL; the new workspace imports it on
   * mount. The current room is left untouched.
   */
  const proceedWithNewProject = () => {
    const conflict = conflictImport;
    setConflictImport(null);
    pendingImportRef.current = null;
    setPendingImport(null);
    if (conflict) actions.openCreateForTemplate(conflict.template.id);
  };

  return (
    // One provider groups the shell's tooltips: neighbouring triggers
    // switch instantly and share the open delay.
    <TooltipProvider>
    <div className="flex h-dvh min-h-0 flex-col overflow-hidden">
      <EditorNavbar
        isSidebarOpen={isSidebarOpen}
        onToggleSidebar={() => setIsSidebarOpen((open) => !open)}
        projectName={activeProject?.name}
        isAiSidebarOpen={isAiSidebarOpen}
        onToggleAiSidebar={
          activeProject ? () => setIsAiSidebarOpen((open) => !open) : undefined
        }
        onShareProject={activeProject ? () => setIsShareOpen(true) : undefined}
        onOpenStarterTemplates={
          activeProject ? () => setIsStarterTemplatesOpen(true) : undefined
        }
      />
      <div className="relative flex min-h-0 flex-1">
        <ProjectSidebar
          isOpen={isSidebarOpen}
          onClose={() => setIsSidebarOpen(false)}
          ownedProjects={ownedProjects}
          sharedProjects={sharedProjects}
          onNewProject={actions.openCreate}
          onRenameProject={actions.openRename}
          onDeleteProject={actions.openDelete}
          currentProjectId={activeProject?.id}
          defaultTab={activeProject?.isShared ? "shared" : "my-projects"}
        />
        <main className="relative flex min-w-0 flex-1 overflow-hidden bg-base">
          {activeProject ? (
            <LiveCanvas
              key={activeProject.id}
              roomId={activeProject.id}
              importRequest={importRequest}
              onTemplateImported={handleTemplateImported}
              onImportConflict={handleImportConflict}
              appliedImport={appliedImport}
              fitInsets={{
                left: isSidebarOpen ? SIDEBAR_WIDTH_PX : 0,
                right: isAiSidebarOpen ? SIDEBAR_WIDTH_PX : 0,
              }}
            />
          ) : (
            <div className="flex min-h-0 flex-1 items-center justify-center">
              <EditorHome onNewProject={actions.openCreate} />
            </div>
          )}
        </main>
        {activeProject && (
          <AiSidebar
            isOpen={isAiSidebarOpen}
            onClose={() => setIsAiSidebarOpen(false)}
          />
        )}
      </div>
      {activeProject && (
        <ShareDialog
          key={activeProject.id}
          projectId={activeProject.id}
          isOwner={!activeProject.isShared}
          open={isShareOpen}
          onOpenChange={setIsShareOpen}
        />
      )}
      {activeProject && (
        <StarterTemplatesModal
          open={isStarterTemplatesOpen}
          onOpenChange={setIsStarterTemplatesOpen}
          onImport={(template) => {
            const request = {
              requestId: crypto.randomUUID(),
              template,
              mode: "ask" as const,
              projectId: activeProject.id,
            };
            pendingImportRef.current = request;
            setPendingImport(request);
          }}
        />
      )}
      {conflictImport && (
        <Dialog
          open
          onOpenChange={(open) => {
            if (!open) {
              // Dismissing the dialog abandons the import.
              setConflictImport(null);
              pendingImportRef.current = null;
              setPendingImport(null);
            }
          }}
        >
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Canvas already has content</DialogTitle>
              <DialogDescription>
                Import “{conflictImport.template.name}” without losing what is
                already on the canvas:
              </DialogDescription>
            </DialogHeader>
            <DialogFooter className="flex-col items-stretch sm:flex-col sm:items-stretch">
              <Button
                onClick={() => proceedWithImport("replace")}
                type="button"
              >
                Replace canvas
              </Button>
              <Button
                className="w-full"
                onClick={() => proceedWithImport("add")}
                variant="outline"
              >
                Add to project
              </Button>
              <Button
                className="w-full"
                onClick={proceedWithNewProject}
                variant="ghost"
              >
                New project
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
      <ProjectDialogs actions={actions} />
    </div>
    </TooltipProvider>
  );
}

"use client";

import { useState } from "react";

import { AiSidebar } from "@/components/editor/ai-sidebar";
import { EditorNavbar } from "@/components/editor/editor-navbar";
import { EditorHome } from "@/components/editor/editor-home";
import { ProjectDialogs } from "@/components/editor/project-dialogs";
import { ProjectSidebar } from "@/components/editor/project-sidebar";
import { useProjectActions } from "@/hooks/use-project-actions";
import type { ProjectListItem } from "@/lib/projects";

interface EditorWorkspaceProps {
  ownedProjects: ProjectListItem[];
  sharedProjects: ProjectListItem[];
  /** The open project on /editor/[roomId]; absent on the /editor home. */
  activeProject?: ProjectListItem;
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
 * sidebar highlights the current room, the center holds the (empty) canvas
 * placeholder, and the AI sidebar floats on the right.
 */
export function EditorWorkspace({
  ownedProjects,
  sharedProjects,
  activeProject,
}: EditorWorkspaceProps) {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  // The AI sidebar only exists in a workspace; it opens by default there so
  // the placeholder is visible on first load.
  const [isAiSidebarOpen, setIsAiSidebarOpen] = useState(Boolean(activeProject));
  const actions = useProjectActions();

  return (
    <div className="flex h-dvh min-h-0 flex-col overflow-hidden">
      <EditorNavbar
        isSidebarOpen={isSidebarOpen}
        onToggleSidebar={() => setIsSidebarOpen((open) => !open)}
        projectName={activeProject?.name}
        isAiSidebarOpen={isAiSidebarOpen}
        onToggleAiSidebar={
          activeProject ? () => setIsAiSidebarOpen((open) => !open) : undefined
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
        <main className="flex min-w-0 flex-1 items-center justify-center bg-base">
          {activeProject ? (
            <p className="px-6 text-center text-sm text-copy-muted">
              Your canvas will appear here.
            </p>
          ) : (
            <EditorHome onNewProject={actions.openCreate} />
          )}
        </main>
        {activeProject && (
          <AiSidebar
            isOpen={isAiSidebarOpen}
            onClose={() => setIsAiSidebarOpen(false)}
          />
        )}
      </div>
      <ProjectDialogs actions={actions} />
    </div>
  );
}

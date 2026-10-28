"use client";

import { useState } from "react";

import { EditorNavbar } from "@/components/editor/editor-navbar";
import { EditorHome } from "@/components/editor/editor-home";
import { ProjectDialogs } from "@/components/editor/project-dialogs";
import { ProjectSidebar } from "@/components/editor/project-sidebar";
import { useProjectActions } from "@/hooks/use-project-actions";
import type { ProjectListItem } from "@/lib/projects";

interface EditorWorkspaceProps {
  ownedProjects: ProjectListItem[];
  sharedProjects: ProjectListItem[];
}

/**
 * The editor shell: navbar, slide-in projects sidebar, and the center area.
 *
 * The project lists are fetched server-side (see app/editor/page.tsx) and
 * passed in as props — no client-side fetching. This component owns the
 * sidebar open/closed state and the useProjectActions hook that wires the
 * home button, the sidebar rows, and every dialog to the project API.
 */
export function EditorWorkspace({ ownedProjects, sharedProjects }: EditorWorkspaceProps) {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const actions = useProjectActions();

  return (
    <div className="flex flex-1 flex-col">
      <EditorNavbar
        isSidebarOpen={isSidebarOpen}
        onToggleSidebar={() => setIsSidebarOpen((open) => !open)}
      />
      <div className="relative flex flex-1">
        <ProjectSidebar
          isOpen={isSidebarOpen}
          onClose={() => setIsSidebarOpen(false)}
          ownedProjects={ownedProjects}
          sharedProjects={sharedProjects}
          onNewProject={actions.openCreate}
          onRenameProject={actions.openRename}
          onDeleteProject={actions.openDelete}
        />
        <main className="flex flex-1 items-center justify-center">
          <EditorHome onNewProject={actions.openCreate} />
        </main>
      </div>
      <ProjectDialogs actions={actions} />
    </div>
  );
}

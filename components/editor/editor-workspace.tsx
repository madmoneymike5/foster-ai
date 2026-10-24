"use client";

import { useState } from "react";

import { EditorNavbar } from "@/components/editor/editor-navbar";
import { EditorHome } from "@/components/editor/editor-home";
import { ProjectDialogs } from "@/components/editor/project-dialogs";
import { ProjectSidebar } from "@/components/editor/project-sidebar";
import { useProjectDialogs } from "@/hooks/use-project-dialogs";

/**
 * The editor shell: navbar, slide-in projects sidebar, and the center area.
 *
 * Before a project is open (spec 04) the center shows the home state; this
 * component owns the sidebar open/closed state and the project-dialog hook
 * that wires the home button and every sidebar action into the dialogs.
 */
export function EditorWorkspace() {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const dialogs = useProjectDialogs();

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
          onNewProject={dialogs.openCreate}
          onRenameProject={dialogs.openRename}
          onDeleteProject={dialogs.openDelete}
        />
        <main className="flex flex-1 items-center justify-center">
          <EditorHome onNewProject={dialogs.openCreate} />
        </main>
      </div>
      <ProjectDialogs dialogs={dialogs} />
    </div>
  );
}

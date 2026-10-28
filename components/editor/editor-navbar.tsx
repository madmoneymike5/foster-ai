"use client";

import { UserButton } from "@clerk/nextjs";
import {
  PanelLeftClose,
  PanelLeftOpen,
  PanelRightClose,
  PanelRightOpen,
  Share2,
} from "lucide-react";

import { Button } from "@/components/ui/button";

interface EditorNavbarProps {
  isSidebarOpen: boolean;
  onToggleSidebar: () => void;
  /** The open project's name; omitted on the `/editor` home. */
  projectName?: string;
  isAiSidebarOpen?: boolean;
  /** Present only for an active workspace; drives the AI sidebar toggle. */
  onToggleAiSidebar?: () => void;
  /** Present only for an active workspace; opens the share dialog. */
  onShareProject?: () => void;
}

/**
 * Top chrome of the editor: projects sidebar toggle on the left, the active
 * project name in the center (workspaces only), and on the right the share
 * button (workspaces only), the AI sidebar toggle (workspaces only), and the
 * signed-in user menu (Clerk `UserButton`).
 * @param isSidebarOpen - Whether the projects sidebar is open; drives the
 *   toggle icon, label, and `aria-expanded`.
 * @param onToggleSidebar - Called when the user clicks the toggle button.
 * @param projectName - Active project name shown centered; `undefined` on the home.
 * @param isAiSidebarOpen - Whether the AI sidebar is open (workspaces only).
 * @param onToggleAiSidebar - Called when the AI sidebar toggle is clicked.
 * @param onShareProject - Called when the share button is clicked (workspaces only).
 */
export function EditorNavbar({
  isSidebarOpen,
  onToggleSidebar,
  projectName,
  isAiSidebarOpen,
  onToggleAiSidebar,
  onShareProject,
}: EditorNavbarProps) {
  return (
    <header className="flex h-12 shrink-0 items-center justify-between border-b border-surface-border bg-surface px-3">
      <div className="flex items-center">
        <Button
          variant="ghost"
          size="icon"
          aria-label={
            isSidebarOpen ? "Close projects sidebar" : "Open projects sidebar"
          }
          aria-expanded={isSidebarOpen}
          onClick={onToggleSidebar}
        >
          {isSidebarOpen ? (
            <PanelLeftClose className="h-5 w-5" />
          ) : (
            <PanelLeftOpen className="h-5 w-5" />
          )}
        </Button>
      </div>
      <div className="flex min-w-0 flex-1 items-center justify-center">
        {projectName && (
          <h1 className="truncate text-sm font-medium text-copy-primary" title={projectName}>
            {projectName}
          </h1>
        )}
      </div>
      <div className="flex items-center gap-1">
        {projectName && onShareProject && (
          <Button
            variant="ghost"
            size="icon"
            aria-label="Share project"
            onClick={onShareProject}
          >
            <Share2 className="h-5 w-5" />
          </Button>
        )}
        {onToggleAiSidebar && (
          <Button
            variant="ghost"
            size="icon"
            aria-label={isAiSidebarOpen ? "Close AI sidebar" : "Open AI sidebar"}
            aria-expanded={isAiSidebarOpen ?? false}
            onClick={onToggleAiSidebar}
          >
            {isAiSidebarOpen ? (
              <PanelRightClose className="h-5 w-5" />
            ) : (
              <PanelRightOpen className="h-5 w-5" />
            )}
          </Button>
        )}
        <UserButton />
      </div>
    </header>
  );
}

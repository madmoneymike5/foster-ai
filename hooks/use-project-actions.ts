"use client";

import { usePathname, useRouter } from "next/navigation";
import { useCallback, useMemo, useState } from "react";

import type { ProjectListItem } from "@/lib/projects";
import { generateProjectId, shortIdSuffix } from "@/lib/slug";

/**
 * Which project dialog is open. "none" means no dialog.
 *
 * @internal
 */
export type ProjectDialog =
  | { kind: "none" }
  | { kind: "create" }
  | { kind: "rename"; project: ProjectListItem }
  | { kind: "delete"; project: ProjectListItem };

export interface UseProjectActions {
  dialog: ProjectDialog;
  /** Current name input value (create or rename dialog). */
  name: string;
  /**
   * Live room ID preview for the create dialog: the name's slug plus the
   * suffix fixed when the dialog opened. The project ID and the Liveblocks
   * room ID are this same value.
   */
  createRoomId: string;
  /** True while a create/rename/delete submission is in flight. */
  isSubmitting: boolean;
  /** User-facing message for the most recent failed mutation. */
  error: string | null;
  setName: (name: string) => void;
  openCreate: () => void;
  openRename: (project: ProjectListItem) => void;
  openDelete: (project: ProjectListItem) => void;
  close: () => void;
  /**
   * Submit the open create/rename/delete dialog against the project API.
   * Create navigates to the new workspace; rename and delete refresh the
   * server-fetched lists (delete of the active workspace redirects to /editor).
   * On a failed request the dialog stays open so the user can retry.
   */
  submit: () => Promise<void>;
}

/**
 * Owns all project-dialog state and the real project mutations for the editor
 * home: which dialog is open, the name form value, the create dialog's fixed
 * uniqueness suffix (so the room ID preview is stable while typing), and the
 * create/rename/delete submissions against the project API.
 */
export function useProjectActions(): UseProjectActions {
  const router = useRouter();
  const pathname = usePathname();

  const [dialog, setDialog] = useState<ProjectDialog>({ kind: "none" });
  const [name, setName] = useState("");
  // Fixed once per dialog open so the preview doesn't churn on every keystroke.
  const [createSuffix, setCreateSuffix] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const createRoomId = useMemo(() => {
    if (dialog.kind !== "create" || !name.trim()) return "";
    return generateProjectId(name, createSuffix);
  }, [dialog.kind, name, createSuffix]);

  // The room segment of /editor/[roomId]; null on the /editor home page.
  const currentRoomId = useMemo(() => {
    const segment = pathname.split("/")[2] ?? "";
    return segment || null;
  }, [pathname]);

  const openCreate = () => {
    setName("");
    setCreateSuffix(shortIdSuffix());
    setError(null);
    setDialog({ kind: "create" });
  };

  const openRename = (project: ProjectListItem) => {
    setName(project.name);
    setError(null);
    setDialog({ kind: "rename", project });
  };

  const openDelete = (project: ProjectListItem) => {
    setError(null);
    setDialog({ kind: "delete", project });
  };

  const close = () => {
    setError(null);
    setDialog({ kind: "none" });
    setIsSubmitting(false);
  };

  const submit = useCallback(async () => {
    if (dialog.kind === "none" || isSubmitting) return;
    if (dialog.kind !== "delete" && !name.trim()) return;

    setIsSubmitting(true);
    setError(null);
    try {
      if (dialog.kind === "create") {
        const response = await fetch("/api/projects", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: name.trim(), id: createRoomId }),
        });
        if (!response.ok) {
          if (response.status === 409) {
            setCreateSuffix(shortIdSuffix());
            setError("A project with this ID already exists. A new ID was generated; please try again.");
          } else {
            setError("Could not create the project. Please try again.");
          }
          return;
        }
        setDialog({ kind: "none" });
        // Refresh so the sidebar gains the new row, then open the workspace.
        router.refresh();
        router.push(`/editor/${createRoomId}`);
        return;
      }

      if (dialog.kind === "rename") {
        const response = await fetch(`/api/projects/${dialog.project.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: name.trim() }),
        });
        if (!response.ok) {
          setError("Could not rename the project. Please try again.");
          return;
        }
        setDialog({ kind: "none" });
        router.refresh();
        return;
      }

      const response = await fetch(`/api/projects/${dialog.project.id}`, { method: "DELETE" });
      if (!response.ok) {
        setError("Could not delete the project. Please try again.");
        return;
      }
      setDialog({ kind: "none" });
      if (currentRoomId === dialog.project.id) {
        // The active workspace is gone; go back to the editor home.
        router.push("/editor");
      } else {
        router.refresh();
      }
    } catch {
      if (dialog.kind === "create") {
        setError("Could not create the project. Please check your connection and try again.");
      } else if (dialog.kind === "rename") {
        setError("Could not rename the project. Please check your connection and try again.");
      } else {
        setError("Could not delete the project. Please check your connection and try again.");
      }
    } finally {
      setIsSubmitting(false);
    }
  }, [dialog, isSubmitting, name, createRoomId, currentRoomId, router]);

  return {
    dialog,
    name,
    createRoomId,
    isSubmitting,
    error,
    setName,
    openCreate,
    openRename,
    openDelete,
    close,
    submit,
  };
}

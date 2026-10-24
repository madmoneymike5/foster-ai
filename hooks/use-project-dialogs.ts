"use client";

import { useMemo, useState } from "react";

import type { Project } from "@/components/editor/mock-projects";
import { slugify } from "@/lib/slug";

/**
 * Which project dialog is open. "none" means no dialog.
 *
 * @internal
 */
export type ProjectDialog =
  | { kind: "none" }
  | { kind: "create" }
  | { kind: "rename"; project: Project }
  | { kind: "delete"; project: Project };

export interface UseProjectDialogs {
  dialog: ProjectDialog;
  /** Current name input value (create or rename dialog). */
  name: string;
  /** Live slug preview derived from {@link UseProjectDialogs.name}. */
  slug: string;
  /** True while a create/rename/delete submission is in flight. */
  isSubmitting: boolean;
  setName: (name: string) => void;
  openCreate: () => void;
  openRename: (project: Project) => void;
  openDelete: (project: Project) => void;
  close: () => void;
  /**
   * Submit the open create/rename/delete dialog. Mock-only for now: no
   * persistence, so the (future) loading window never becomes visible.
   */
  submit: () => void;
}

/**
 * Owns all project-dialog state for the editor: which dialog is open, the
 * name form value, the derived slug preview, and the submission flag.
 *
 * Data is mock-only (spec 04) — submitting closes the dialog without any
 * API call or persistence. `isSubmitting` exists so the future real submit
 * can drive button disabled states without touching call sites.
 */
export function useProjectDialogs(): UseProjectDialogs {
  const [dialog, setDialog] = useState<ProjectDialog>({ kind: "none" });
  const [name, setName] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const slug = useMemo(() => slugify(name), [name]);

  const openCreate = () => {
    setName("");
    setDialog({ kind: "create" });
  };

  const openRename = (project: Project) => {
    setName(project.name);
    setDialog({ kind: "rename", project });
  };

  const openDelete = (project: Project) => {
    setDialog({ kind: "delete", project });
  };

  const close = () => {
    setDialog({ kind: "none" });
    setIsSubmitting(false);
  };

  const submit = () => {
    if (dialog.kind === "none" || isSubmitting) return;
    if (dialog.kind !== "delete" && !name.trim()) return;

    setIsSubmitting(true);
    // Mock submit: there is no API or persistence yet, so the operation
    // "completes" synchronously and the dialog simply closes.
    setDialog({ kind: "none" });
    setIsSubmitting(false);
  };

  return {
    dialog,
    name,
    slug,
    isSubmitting,
    setName,
    openCreate,
    openRename,
    openDelete,
    close,
    submit,
  };
}

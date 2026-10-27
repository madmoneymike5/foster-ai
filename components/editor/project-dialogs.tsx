"use client";

import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { UseProjectActions } from "@/hooks/use-project-actions";
import { cn } from "@/lib/utils";

interface ProjectDialogsProps {
  actions: UseProjectActions;
}

interface NameFieldProps {
  label: string;
  placeholder: string;
  value: string;
  onChange: (value: string) => void;
  /** Optional live preview rendered under the input (the create dialog's room ID). */
  preview?: string;
}

/**
 * Name input, optionally with a live preview under the field. Used by the
 * create dialog (room ID preview) and the rename dialog (no preview — the
 * project/room ID is unchanged by a rename).
 */
function NameField({ label, placeholder, value, onChange, preview }: NameFieldProps) {
  return (
    <div className="flex flex-col gap-2">
      <label className="flex flex-col gap-1.5 text-sm text-copy-secondary">
        {label}
        <Input autoFocus value={value} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} />
      </label>
      {preview !== undefined && (
        <p aria-live="polite" className={cn("font-mono text-xs", preview ? "text-copy-muted" : "text-copy-faint")}>
          /{preview || "—"}
        </p>
      )}
    </div>
  );
}

/**
 * Renders whichever project dialog the hook says is open: create, rename, or
 * delete. Submissions hit the project API through the hook; the create dialog
 * previews the room ID the project will get, and the delete dialog names the
 * project that will be removed.
 */
export function ProjectDialogs({ actions }: ProjectDialogsProps) {
  const { dialog, name, createRoomId, isSubmitting, error, setName, close, submit } = actions;

  const handleFormSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void submit();
  };

  return (
    <>
      {dialog.kind === "create" && (
        <Dialog
          open
          onOpenChange={(open) => {
            if (!open) close();
          }}
        >
          <DialogContent className="rounded-3xl">
            <DialogHeader>
              <DialogTitle>New project</DialogTitle>
              <DialogDescription>Set up a new architecture workspace.</DialogDescription>
            </DialogHeader>
            <form onSubmit={handleFormSubmit}>
              <NameField
                label="Project name"
                placeholder="My project"
                value={name}
                onChange={setName}
                preview={createRoomId}
              />
              {error && <p role="alert" className="text-sm text-state-error">{error}</p>}
              <DialogFooter>
                <Button type="button" variant="outline" onClick={close}>
                  Cancel
                </Button>
                <Button type="submit" disabled={!name.trim() || isSubmitting}>
                  Create project
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      )}

      {dialog.kind === "rename" && (
        <Dialog
          open
          onOpenChange={(open) => {
            if (!open) close();
          }}
        >
          <DialogContent className="rounded-3xl">
            <DialogHeader>
              <DialogTitle>Rename project</DialogTitle>
              <DialogDescription>
                Current name: <span className="font-mono text-copy-secondary">{dialog.project.name}</span>
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleFormSubmit}>
              <NameField label="New name" placeholder="Project name" value={name} onChange={setName} />
              {error && <p role="alert" className="text-sm text-state-error">{error}</p>}
              <DialogFooter>
                <Button type="button" variant="outline" onClick={close}>
                  Cancel
                </Button>
                <Button type="submit" disabled={!name.trim() || isSubmitting}>
                  Save
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      )}

      {dialog.kind === "delete" && (
        <Dialog
          open
          onOpenChange={(open) => {
            if (!open) close();
          }}
        >
          <DialogContent className="rounded-3xl">
            <DialogHeader>
              <DialogTitle>Delete project</DialogTitle>
              <DialogDescription>
                Are you sure you want to delete{" "}
                <span className="font-mono text-copy-secondary">{dialog.project.name}</span>? This
                cannot be undone.
              </DialogDescription>
            </DialogHeader>
            {error && <p role="alert" className="text-sm text-state-error">{error}</p>}
            <DialogFooter>
              <Button variant="outline" onClick={close}>
                Cancel
              </Button>
              <Button variant="destructive" disabled={isSubmitting} onClick={() => void submit()}>
                Delete project
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}

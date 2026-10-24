"use client";

import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { UseProjectDialogs } from "@/hooks/use-project-dialogs";
import { cn } from "@/lib/utils";

interface ProjectDialogsProps {
  dialogs: UseProjectDialogs;
}

interface NameFieldProps {
  dialogs: UseProjectDialogs;
  label: string;
  placeholder: string;
}

/**
 * Name input with live slug preview for the create and rename dialogs.
 * The preview re-derives from the input on every keystroke.
 */
function NameField({ dialogs, label, placeholder }: NameFieldProps) {
  const { name, slug, setName } = dialogs;

  return (
    <div className="flex flex-col gap-2">
      <label className="flex flex-col gap-1.5 text-sm text-copy-secondary">
        {label}
        <Input
          autoFocus
          value={name}
          placeholder={placeholder}
          onChange={(event) => setName(event.target.value)}
        />
      </label>
      <p
        aria-live="polite"
        className={cn("font-mono text-xs", slug ? "text-copy-muted" : "text-copy-faint")}
      >
        /{slug || "—"}
      </p>
    </div>
  );
}

/**
 * Renders whichever project dialog the hook says is open: create, rename, or
 * delete. Mock-only — submissions close the dialog without persistence.
 */
export function ProjectDialogs({ dialogs }: ProjectDialogsProps) {
  const { dialog, slug, isSubmitting, close, submit } = dialogs;

  const handleFormSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    submit();
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
              <NameField dialogs={dialogs} label="Project name" placeholder="My project" />
              <DialogFooter>
                <Button type="button" variant="outline" onClick={close}>
                  Cancel
                </Button>
                <Button type="submit" disabled={!slug || isSubmitting}>
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
              <NameField dialogs={dialogs} label="New name" placeholder="Project name" />
              <DialogFooter>
                <Button type="button" variant="outline" onClick={close}>
                  Cancel
                </Button>
                <Button type="submit" disabled={!slug || isSubmitting}>
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
            <DialogFooter>
              <Button variant="outline" onClick={close}>
                Cancel
              </Button>
              <Button variant="destructive" disabled={isSubmitting} onClick={submit}>
                Delete project
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}

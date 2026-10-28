"use client";

import Image from "next/image";
import { Check, Copy, Trash2 } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import type { Collaborator } from "@/lib/collaborators";

interface ShareDialogProps {
  projectId: string;
  /**
   * Owners can invite and remove collaborators and copy the project link.
   * Collaborators view the collaborator list only.
   */
  isOwner: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** How long the copy button keeps showing `Copied!` feedback. */
const COPY_FEEDBACK_MS = 2000;

/**
 * Circular avatar for a collaborator row: the Clerk image when available,
 * otherwise the first letter of the display name.
 */
function CollaboratorAvatar({ collaborator }: { collaborator: Collaborator }) {
  if (collaborator.avatarUrl) {
    return (
      <Image
        src={collaborator.avatarUrl}
        alt=""
        width={32}
        height={32}
        unoptimized
        className="h-8 w-8 shrink-0 rounded-full object-cover"
      />
    );
  }
  return (
    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent-dim text-sm font-medium text-brand">
      {collaborator.displayName.charAt(0).toUpperCase()}
    </span>
  );
}

/**
 * The share dialog for the active project.
 *
 * The collaborator list is fetched from the project API every time the dialog
 * opens so it reflects changes made elsewhere. Owners additionally get the
 * invite form, per-row remove, and the project-link copy control with
 * temporary `Copied!` feedback; collaborators see the list only.
 *
 * List state is derived: `null` with no error means the fetch is in flight
 * (loading), so no separate loading flag is needed.
 *
 * @param projectId - The project being shared (the /editor/[roomId] ID).
 * @param isOwner - Whether the caller owns the project and may manage access.
 * @param open - Controlled open/closed state (owned by the workspace).
 * @param onOpenChange - Called when the dialog requests a close.
 */
export function ShareDialog({ projectId, isOwner, open, onOpenChange }: ShareDialogProps) {
  const [collaborators, setCollaborators] = useState<Collaborator[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [inviteEmail, setInviteEmail] = useState("");
  const [isInviting, setIsInviting] = useState(false);
  const [removingEmail, setRemovingEmail] = useState<string | null>(null);
  const [isCopied, setIsCopied] = useState(false);
  const copiedTimer = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (copiedTimer.current !== null) window.clearTimeout(copiedTimer.current);
    };
  }, []);

  const fetchCollaborators = useCallback(
    () =>
      fetch(`/api/projects/${projectId}/collaborators`).then(async (response) => {
        if (!response.ok) throw new Error(`status ${response.status}`);
        return (await response.json()) as { collaborators: Collaborator[] };
      }),
    [projectId],
  );

  const load = useCallback(async () => {
    try {
      const data = await fetchCollaborators();
      setCollaborators(data.collaborators);
      setError(null);
    } catch {
      setError("Could not load collaborators.");
    }
  }, [fetchCollaborators]);

  // Refetch on every open so the list reflects changes made elsewhere. All
  // state updates happen in the promise callbacks, never synchronously in the
  // effect body.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    fetchCollaborators()
      .then((data) => {
        if (!cancelled) {
          setCollaborators(data.collaborators);
          setError(null);
        }
      })
      .catch(() => {
        if (!cancelled) setError("Could not load collaborators.");
      });
    return () => {
      cancelled = true;
    };
  }, [open, fetchCollaborators]);

  // The dialog content only renders while open (a post-hydration user
  // action), so the origin can be read directly.
  const projectLink =
    open && typeof window !== "undefined"
      ? `${window.location.origin}/editor/${projectId}`
      : "";

  const invite = useCallback(async () => {
    const email = inviteEmail.trim();
    if (!email || isInviting) return;

    setIsInviting(true);
    setError(null);
    try {
      const response = await fetch(`/api/projects/${projectId}/collaborators`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: string } | null;
        setError(body?.error ?? "Could not invite the collaborator. Please try again.");
        return;
      }
      setInviteEmail("");
      await load();
    } catch {
      setError("Could not invite the collaborator. Please check your connection and try again.");
    } finally {
      setIsInviting(false);
    }
  }, [inviteEmail, isInviting, projectId, load]);

  const remove = useCallback(
    async (email: string) => {
      if (removingEmail) return;

      setRemovingEmail(email);
      setError(null);
      try {
        const response = await fetch(`/api/projects/${projectId}/collaborators`, {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email }),
        });
        if (!response.ok) {
          const body = (await response.json().catch(() => null)) as { error?: string } | null;
          setError(body?.error ?? "Could not remove the collaborator. Please try again.");
          return;
        }
        await load();
      } catch {
        setError("Could not remove the collaborator. Please check your connection and try again.");
      } finally {
        setRemovingEmail(null);
      }
    },
    [projectId, removingEmail, load],
  );

  const copyLink = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(projectLink);
      setIsCopied(true);
      if (copiedTimer.current !== null) window.clearTimeout(copiedTimer.current);
      copiedTimer.current = window.setTimeout(() => setIsCopied(false), COPY_FEEDBACK_MS);
    } catch {
      setError("Could not copy the link.");
    }
  }, [projectLink]);

  const inviteDisabled = !inviteEmail.trim() || isInviting;
  // A list error with no loaded data is a failed first load (retryable).
  const listFailed = error !== null && collaborators === null;

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) onOpenChange(false);
      }}
    >
      <DialogContent className="rounded-3xl">
        <DialogHeader>
          <DialogTitle>Share project</DialogTitle>
          <DialogDescription>
            {isOwner
              ? "Invite collaborators and share the project link."
              : "People who can collaborate on this project."}
          </DialogDescription>
        </DialogHeader>

        {isOwner && (
          <div className="flex items-center gap-2">
            <Input
              readOnly
              value={projectLink}
              aria-label="Project link"
              className="font-mono text-xs"
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void copyLink()}
              aria-live="polite"
            >
              {isCopied ? (
                <Check className="h-4 w-4 text-state-success" />
              ) : (
                <Copy className="h-4 w-4" />
              )}
              {isCopied ? "Copied!" : "Copy"}
            </Button>
          </div>
        )}

        {isOwner && (
          <form
            className="flex flex-col gap-1.5"
            onSubmit={(event) => {
              event.preventDefault();
              void invite();
            }}
          >
            <label htmlFor="invite-email" className="text-sm text-copy-secondary">
              Invite by email
            </label>
            <div className="flex items-center gap-2">
              <Input
                id="invite-email"
                type="email"
                placeholder="teammate@example.com"
                value={inviteEmail}
                onChange={(event) => setInviteEmail(event.target.value)}
              />
              <Button type="submit" size="sm" disabled={inviteDisabled}>
                {isInviting ? "Inviting…" : "Invite"}
              </Button>
            </div>
          </form>
        )}

        <div className="max-h-[50vh] overflow-y-auto">
          {listFailed ? (
            <div className="flex flex-col gap-2">
              <p role="alert" className="text-sm text-state-error">
                {error}
              </p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  setError(null);
                  void load();
                }}
              >
                Try again
              </Button>
            </div>
          ) : collaborators === null ? (
            <p aria-live="polite" className="text-sm text-copy-muted">
              Loading collaborators…
            </p>
          ) : collaborators.length > 0 ? (
            <ul className="flex flex-col gap-1">
              {collaborators.map((collaborator) => (
                <li key={collaborator.email} className="flex items-center gap-3 rounded-xl px-2 py-1.5">
                  <CollaboratorAvatar collaborator={collaborator} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm text-copy-primary">
                      {collaborator.displayName}
                    </p>
                    {collaborator.displayName !== collaborator.email && (
                      <p className="truncate text-xs text-copy-muted">{collaborator.email}</p>
                    )}
                  </div>
                  {isOwner && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`Remove ${collaborator.displayName}`}
                      disabled={removingEmail === collaborator.email}
                      onClick={() => void remove(collaborator.email)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-copy-muted">No collaborators yet.</p>
          )}
        </div>

        {error && !listFailed && (
          <p role="alert" className="text-sm text-state-error">
            {error}
          </p>
        )}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

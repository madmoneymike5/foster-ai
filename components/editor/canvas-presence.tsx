"use client";

import { useAuth, UserButton } from "@clerk/nextjs";
import { shallow, useOthersMapped } from "@liveblocks/react/suspense";
import Image from "next/image";
import { useMemo } from "react";
import { Panel } from "@xyflow/react";

interface ParticipantInfo {
  id: string;
  name: string;
  avatar: string;
  color: string;
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  return parts
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

function CollaboratorAvatar({ participant }: { participant: ParticipantInfo }) {
  return (
    <div
      aria-label={`${participant.name} is collaborating`}
      className="-ml-2 flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full bg-subtle text-xs font-medium text-copy-primary ring-2 ring-base first:ml-0"
      data-canvas-collaborator-avatar="true"
      title={participant.name}
    >
      {participant.avatar ? (
        <Image
          src={participant.avatar}
          alt=""
          width={32}
          height={32}
          unoptimized
          className="h-full w-full object-cover"
        />
      ) : (
        getInitials(participant.name)
      )}
    </div>
  );
}

function CanvasParticipantGroup({ currentUserId }: { currentUserId: string | null }) {
  const mappedParticipants = useOthersMapped(
    (other) => ({
      id: other.id,
      name: other.info.name,
      avatar: other.info.avatar,
      color: other.info.color,
    }),
    shallow,
  );
  const collaborators = useMemo(() => {
    const seen = new Set<string>();
    return mappedParticipants
      .map(([, participant]) => participant)
      .filter((participant) => {
        if (participant.id === currentUserId || seen.has(participant.id)) {
          return false;
        }
        seen.add(participant.id);
        return true;
      });
  }, [currentUserId, mappedParticipants]);
  const visibleCollaborators = collaborators.slice(0, 5);
  const overflowCount = Math.max(collaborators.length - visibleCollaborators.length, 0);

  return (
    <Panel position="top-right" className="!m-3">
      <div
        aria-label="Canvas participants"
        className="flex items-center rounded-xl border border-surface-border bg-surface/90 px-2 py-1 shadow-lg backdrop-blur"
        data-canvas-presence="true"
      >
        {visibleCollaborators.length > 0 && (
          <div className="flex items-center" data-canvas-collaborators="true">
            {visibleCollaborators.map((participant) => (
              <CollaboratorAvatar key={participant.id} participant={participant} />
            ))}
            {overflowCount > 0 && (
              <span
                aria-label={`${overflowCount} more collaborators`}
                className="-ml-2 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-elevated text-xs font-medium text-copy-secondary ring-2 ring-base"
                data-canvas-collaborator-overflow="true"
              >
                +{overflowCount}
              </span>
            )}
          </div>
        )}
        {collaborators.length > 0 && (
          <div
            aria-hidden="true"
            className="mx-2 h-6 w-px bg-surface-border"
            data-canvas-presence-divider="true"
          />
        )}
        <div
          className="flex h-8 w-8 shrink-0 items-center justify-center"
          data-canvas-current-user="true"
        >
          <UserButton appearance={{ elements: { avatarBox: "h-8 w-8" } }} />
        </div>
      </div>
    </Panel>
  );
}

function CanvasCursors({ currentUserId }: { currentUserId: string | null }) {
  const mappedCursors = useOthersMapped(
    (other) => ({
      id: other.id,
      name: other.info.name,
      color: other.info.color,
      cursor: other.presence.cursor,
    }),
    shallow,
  );

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 z-50 overflow-hidden"
      data-canvas-cursors="true"
    >
      {mappedCursors.map(([connectionId, participant]) => {
        if (participant.id === currentUserId || !participant.cursor) return null;
        return (
          <div
            key={connectionId}
            className="absolute flex items-start gap-1"
            data-canvas-cursor="true"
            style={{
              left: participant.cursor.x,
              top: participant.cursor.y,
              color: participant.color,
            }}
          >
            <svg
              aria-hidden="true"
              className="h-4 w-4 shrink-0 drop-shadow-md"
              fill="currentColor"
              viewBox="0 0 16 20"
            >
              <path d="M1 1 14.5 9.5 8.7 10.7 6.1 17.9 1 1Z" />
            </svg>
            <span
              className="mt-2 max-w-40 truncate rounded-md px-1.5 py-0.5 text-[10px] font-medium leading-tight text-copy-primary shadow-md"
              style={{ backgroundColor: participant.color }}
            >
              {participant.name}
            </span>
          </div>
        );
      })}
    </div>
  );
}

/**
 * Renders the room's canvas-local participant group and other users' cursors.
 * The editor navbar remains responsible for its existing Clerk user menu.
 *
 * @param currentUserId - The active Clerk user ID, used to exclude the current
 * user from collaborator avatars and cursor rendering.
 */
export function CanvasPresence() {
  const { userId } = useAuth();
  const currentUserId = userId ?? null;

  return (
    <>
      <CanvasParticipantGroup currentUserId={currentUserId} />
      <CanvasCursors currentUserId={currentUserId} />
    </>
  );
}

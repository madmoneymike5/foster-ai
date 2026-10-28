import 'server-only';

import { currentUser } from "@clerk/nextjs/server";

import { db } from "./prisma";
import { isProjectId } from "./slug";

/**
 * The caller's identity as a project access check needs it: the Clerk user
 * ID (ownership is keyed on this) and the primary email address
 * (collaborator rows are keyed on this).
 */
export interface ProjectIdentity {
  userId: string;
  primaryEmail: string | null;
}

/**
 * The access record for a project the identity may open.
 */
export interface ProjectAccess {
  project: { id: string; name: string };
  isOwner: boolean;
}

/**
 * Resolves the signed-in Clerk user's identity for project access checks.
 *
 * @returns The identity, or `null` when no user is signed in.
 */
export async function getCurrentProjectIdentity(): Promise<ProjectIdentity | null> {
  const user = await currentUser();
  if (!user) return null;
  return {
    userId: user.id,
    primaryEmail: user.primaryEmailAddress?.emailAddress ?? null,
  };
}

/**
 * Checks whether the identity may access the project: the owner, or a
 * collaborator row matching the identity's primary email.
 *
 * A missing project and an unauthorized project both return `null` on
 * purpose — callers cannot distinguish them, so nonexistent project IDs are
 * not leaked to users without access.
 *
 * @param projectId - The project (room) ID from the URL segment.
 * @param identity - The caller's resolved identity.
 * @returns The access record, or `null` when the project is missing or the
 *   identity has no access to it.
 */
export async function checkProjectAccess(
  projectId: string,
  identity: ProjectIdentity
): Promise<ProjectAccess | null> {
  // The URL segment is external input; validate it at the boundary the same
  // way the project API does before it reaches the database.
  if (!isProjectId(projectId)) return null;

  const project = await db.orm.public.Project.first({ id: projectId });
  if (!project) return null;

  if (project.ownerId === identity.userId) {
    return { project: { id: project.id, name: project.name }, isOwner: true };
  }

  if (identity.primaryEmail) {
    const collaboration = await db.orm.public.ProjectCollaborator.first({
      projectId: project.id,
      email: identity.primaryEmail,
    });
    if (collaboration) {
      return { project: { id: project.id, name: project.name }, isOwner: false };
    }
  }

  return null;
}

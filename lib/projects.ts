import 'server-only';

import { db } from './prisma';

/**
 * A project row as the editor UI consumes it: just enough to list, open,
 * rename, and delete. The id doubles as the /editor/[roomId] segment and the
 * Liveblocks room ID, so no slug field is carried separately.
 */
export interface ProjectListItem {
  id: string;
  name: string;
  /** True for projects shared to the user as a collaborator; false for owned projects. */
  isShared: boolean;
}

/**
 * Lists the projects the given Clerk user owns, newest first.
 *
 * @param userId - Clerk user ID acting as the owner scope.
 */
export async function getOwnedProjects(userId: string): Promise<ProjectListItem[]> {
  const projects = await db.orm.public.Project.where((w) => w.ownerId.eq(userId))
    .orderBy((o) => o.createdAt.desc())
    .all();

  return projects.map((project) => ({ id: project.id, name: project.name, isShared: false }));
}

/**
 * Lists projects shared to the user's email address as a collaborator.
 * Projects the user also owns are excluded so they appear once, in the owned
 * list. Shared rows are ordered by when the collaboration was added, newest
 * first (the collaborator row carries the grant timestamp; the project's own
 * createdAt is unrelated to the share).
 *
 * @param email - The user's primary email address (collaborators are matched by email).
 * @param excludeProjectIds - Project IDs to omit (the user's own projects).
 */
export async function getSharedProjects(email: string, excludeProjectIds: string[] = []): Promise<ProjectListItem[]> {
  const collaborations = await db.orm.public.ProjectCollaborator.where((w) => w.email.eq(email))
    .orderBy((o) => o.createdAt.desc())
    .all();

  // Keep the collaboration order (grant recency) while deduping by project.
  const exclude = new Set(excludeProjectIds);
  const seen = new Set<string>();
  const projectIds: string[] = [];
  for (const collaboration of collaborations) {
    if (exclude.has(collaboration.projectId) || seen.has(collaboration.projectId)) continue;
    seen.add(collaboration.projectId);
    projectIds.push(collaboration.projectId);
  }
  if (projectIds.length === 0) return [];

  // The ORM's `in` filter is only available in callback form — the object
  // form silently matches nothing (verified against the runtime).
  const projects = await db.orm.public.Project.where((w) => w.id.in(projectIds)).all();
  const byId = new Map(projects.map((project) => [project.id, project]));

  return projectIds
    .map((id) => byId.get(id))
    .filter((project): project is NonNullable<typeof project> => project !== undefined)
    .map((project) => ({ id: project.id, name: project.name, isShared: true }));
}

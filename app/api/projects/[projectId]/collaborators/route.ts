import {
  getVerifiedClerkUserIdsByEmails,
  listCollaborators,
  normalizeEmail,
} from "@/lib/collaborators";
import {
  getLiveblocksClient,
  LIVEBLOCKS_REQUEST_TIMEOUT_MS,
} from "@/lib/liveblocks";
import { checkProjectAccess, getCurrentProjectIdentity } from "@/lib/project-access";
import { db } from "@/lib/prisma";
import { isProjectId } from "@/lib/slug";

type CollaboratorRouteContext = {
  params: Promise<{ projectId: string }>;
};

/** Clerk's list endpoint has no per-request AbortSignal option. */
function withRequestTimeout<T>(request: Promise<T>, operation: string): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const timeoutRequest = new Promise<never>((_, reject) => {
    timeout = setTimeout(
      () => reject(new Error(`${operation} timed out after ${LIVEBLOCKS_REQUEST_TIMEOUT_MS}ms`)),
      LIVEBLOCKS_REQUEST_TIMEOUT_MS,
    );
  });

  return Promise.race([request, timeoutRequest]).finally(() => {
    if (timeout) clearTimeout(timeout);
  });
}

/**
 * Narrow parsed JSON to the object shape accepted by the collaborator API.
 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Postgres unique-violation (23505) — thrown by the ORM on PK collisions. */
function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "sqlState" in error &&
    (error as { sqlState: unknown }).sqlState === "23505"
  );
}

/** Liveblocks throws an error with `status: 404` when a room does not exist. */
function isLiveblocksNotFound(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "status" in error &&
    (error as { status: unknown }).status === 404
  );
}

/**
 * Parse and normalize the `{ email }` invite/remove request body.
 *
 * @param request - Incoming collaborator invite or remove request.
 * @returns The normalized (trimmed, lowercased) email, or `null` for invalid input.
 */
async function readEmailBody(request: Request): Promise<string | null> {
  const text = await request.text();
  if (!text.trim()) return null;

  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return null;
  }

  if (!isRecord(body) || typeof body.email !== "string") return null;
  return normalizeEmail(body.email);
}

/**
 * Resolve and validate the dynamic project ID before querying the database.
 *
 * @param context - Next.js route context containing the promised path params.
 * @returns A valid project ID, or `null` for malformed path input.
 */
async function getProjectId(context: CollaboratorRouteContext): Promise<string | null> {
  const { projectId } = await context.params;
  return isProjectId(projectId) ? projectId : null;
}

/**
 * Lists a project's collaborators (enriched with Clerk name/avatar) for an
 * authenticated owner or collaborator.
 */
export async function GET(_request: Request, context: CollaboratorRouteContext) {
  const identity = await getCurrentProjectIdentity();
  if (!identity) {
    return Response.json({ error: "Authentication required" }, { status: 401 });
  }

  const projectId = await getProjectId(context);
  if (!projectId) {
    return Response.json({ error: "Invalid project ID" }, { status: 400 });
  }

  const access = await checkProjectAccess(projectId, identity);
  if (!access) {
    return Response.json({ error: "Project not found" }, { status: 404 });
  }

  const collaborators = await listCollaborators(projectId);
  return Response.json({ collaborators });
}

/**
 * Invites a collaborator by email. Owner-only, enforced server-side: the
 * caller must own the project, not merely have access to it.
 */
export async function POST(request: Request, context: CollaboratorRouteContext) {
  const identity = await getCurrentProjectIdentity();
  if (!identity) {
    return Response.json({ error: "Authentication required" }, { status: 401 });
  }

  const projectId = await getProjectId(context);
  if (!projectId) {
    return Response.json({ error: "Invalid project ID" }, { status: 400 });
  }

  const email = await readEmailBody(request);
  if (!email) {
    return Response.json(
      { error: "Request body must contain a valid collaborator email" },
      { status: 400 },
    );
  }

  const access = await checkProjectAccess(projectId, identity);
  if (!access) {
    return Response.json({ error: "Project not found" }, { status: 404 });
  }
  if (!access.isOwner) {
    return Response.json({ error: "Project ownership required" }, { status: 403 });
  }

  // The create-and-catch handles the duplicate-invite race; a pre-check alone
  // would still be wrong under concurrent invites.
  try {
    const collaborator = await db.orm.public.ProjectCollaborator.create({
      projectId,
      email,
    });
    return Response.json({ collaborator }, { status: 201 });
  } catch (error) {
    if (isUniqueViolation(error)) {
      return Response.json(
        { error: "This email is already a collaborator" },
        { status: 409 },
      );
    }
    throw error;
  }
}

/**
 * Removes a collaborator by email. Owner-only, enforced server-side.
 */
export async function DELETE(request: Request, context: CollaboratorRouteContext) {
  const identity = await getCurrentProjectIdentity();
  if (!identity) {
    return Response.json({ error: "Authentication required" }, { status: 401 });
  }

  const projectId = await getProjectId(context);
  if (!projectId) {
    return Response.json({ error: "Invalid project ID" }, { status: 400 });
  }

  const email = await readEmailBody(request);
  if (!email) {
    return Response.json(
      { error: "Request body must contain a valid collaborator email" },
      { status: 400 },
    );
  }

  const access = await checkProjectAccess(projectId, identity);
  if (!access) {
    return Response.json({ error: "Project not found" }, { status: 404 });
  }
  if (!access.isOwner) {
    return Response.json({ error: "Project ownership required" }, { status: 403 });
  }

  return db.transaction(async (tx) => {
    // Match the token endpoint's lock so grant upserts cannot race this revoke.
    const project = await tx.orm.public.Project.where({ id: projectId })
      .forNoKeyUpdate()
      .first();
    if (!project) {
      return Response.json({ error: "Project not found" }, { status: 404 });
    }
    if (project.ownerId !== identity.userId) {
      return Response.json({ error: "Project ownership required" }, { status: 403 });
    }
    if (project.status !== "DRAFT") {
      return Response.json({ error: "Project deletion is already in progress" }, { status: 409 });
    }

    const collaborators = await tx.orm.public.ProjectCollaborator.where((w) =>
      w.projectId.eq(projectId),
    ).all();
    const collaborator = collaborators.find((row) => row.email === email);
    if (!collaborator) {
      return Response.json({ error: "Collaborator not found" }, { status: 404 });
    }

    try {
      const remainingEmails = collaborators
        .filter((row) => row.email !== email)
        .map((row) => row.email);
      const [permittedUserIds, removedUserIds] = await Promise.all([
        withRequestTimeout(
          getVerifiedClerkUserIdsByEmails(remainingEmails),
          "Clerk remaining collaborator lookup",
        ),
        withRequestTimeout(
          getVerifiedClerkUserIdsByEmails([email]),
          "Clerk removed collaborator lookup",
        ),
      ]);
      // The owner remains authorized even if they also have a collaborator row.
      permittedUserIds.add(identity.userId);

      const liveblocks = getLiveblocksClient();
      let room: Awaited<ReturnType<typeof liveblocks.getRoom>> | null = null;
      try {
        room = await liveblocks.getRoom(projectId, {
          signal: AbortSignal.timeout(LIVEBLOCKS_REQUEST_TIMEOUT_MS),
        });
      } catch (error) {
        if (!isLiveblocksNotFound(error)) throw error;
      }

      if (room) {
        const revokedUserIds = Object.keys(room.usersAccesses).filter(
          (userId) => !permittedUserIds.has(userId),
        );
        const revokeTargets = new Set([
          ...revokedUserIds,
          ...[...removedUserIds].filter((userId) => !permittedUserIds.has(userId)),
        ]);
        if (revokedUserIds.length > 0) {
          await liveblocks.updateRoom(projectId, {
            usersAccesses: Object.fromEntries(
              revokedUserIds.map((userId) => [userId, null]),
            ),
          }, {
            signal: AbortSignal.timeout(LIVEBLOCKS_REQUEST_TIMEOUT_MS),
          });
        }
        await Promise.all(
          [...revokeTargets].map((userId) =>
            liveblocks.broadcastEvent(projectId, {
              type: "access-revoked",
              userId,
            }, {
              signal: AbortSignal.timeout(LIVEBLOCKS_REQUEST_TIMEOUT_MS),
            }),
          ),
        );
      }
    } catch (error) {
      console.error(
        `Failed to revoke Liveblocks access for collaborator ${email} in ${projectId}:`,
        error,
      );
      return Response.json(
        { error: "Collaborator access could not be revoked" },
        { status: 502 },
      );
    }

    const removed = await tx.orm.public.ProjectCollaborator.where({
      projectId,
      email,
    }).delete();
    if (!removed) {
      return Response.json({ error: "Collaborator not found" }, { status: 404 });
    }

    return Response.json({ collaborator: removed });
  });
}

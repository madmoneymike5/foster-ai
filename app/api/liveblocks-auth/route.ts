import { currentUser } from "@clerk/nextjs/server";

import {
  getCursorColorForUser,
  getLiveblocksClient,
  LIVEBLOCKS_REQUEST_TIMEOUT_MS,
} from "@/lib/liveblocks";
import { getCurrentProjectIdentity } from "@/lib/project-access";
import { db } from "@/lib/prisma";
import { isProjectId } from "@/lib/slug";

function jsonError(message: string, status: number) {
  return Response.json({ error: message }, { status });
}

/**
 * Issues a Liveblocks ID-token session for a project room.
 *
 * The Liveblocks room ID is the project ID. A room may only be entered after
 * Clerk authentication and project access (owner or collaborator), so the
 * endpoint is the security boundary: only verified members can obtain a
 * token. Rooms are created on first use as private rooms; each verified
 * member receives (or refreshes) a per-user write grant.
 *
 * @returns The ID-token response from Liveblocks on success; `401` when
 *   unauthenticated, `400` for malformed input, `403` when the project is
 *   missing or the caller has no access (uniform, so existence is not
 *   leaked), `502` when the Liveblocks API fails.
 */
export async function POST(request: Request) {
  const identity = await getCurrentProjectIdentity();
  if (!identity) {
    return jsonError("Authentication required", 401);
  }

  let parsed: unknown;
  try {
    parsed = await request.json();
  } catch {
    return jsonError("Body must be valid JSON", 400);
  }
  const room = (parsed as { room?: unknown } | null)?.room;
  if (typeof room !== "string" || !isProjectId(room)) {
    return jsonError("A valid room (project ID) is required", 400);
  }

  const user = await currentUser();
  if (!user) {
    // Unreachable: the identity above was resolved from the same session.
    return jsonError("Authentication required", 401);
  }

  const result = await db.transaction(async (tx) => {
    const project = await tx.orm.public.Project.where({ id: room })
      .forNoKeyUpdate()
      .first();
    if (!project || project.status !== "DRAFT") return null;

    let hasAccess = project.ownerId === identity.userId;
    if (!hasAccess && identity.accessEmails.length > 0) {
      const collaborators = await tx.orm.public.ProjectCollaborator.where((w) =>
        w.projectId.eq(project.id),
      ).all();
      hasAccess = collaborators.some((collaborator) =>
        identity.accessEmails.includes(collaborator.email),
      );
    }
    if (!hasAccess) return null;

    try {
      const client = getLiveblocksClient();
      // The project row lock serializes this grant with collaborator removal.
      await client.upsertRoom(project.id, {
        update: {
          usersAccesses: { [identity.userId]: ["*:write"] },
        },
        create: { defaultAccesses: [] },
      }, { signal: AbortSignal.timeout(LIVEBLOCKS_REQUEST_TIMEOUT_MS) });
      return { client };
    } catch (error) {
      console.error(`Failed to ensure Liveblocks room ${project.id}:`, error);
      return { setupFailed: true } as const;
    }
  });

  if (!result) {
    return jsonError("Project access is required", 403);
  }
  if ("setupFailed" in result) {
    return jsonError("Liveblocks room setup failed", 502);
  }

  const response = await result.client.identifyUser(
    // `groupIds` is required by the SDK's Identity type; Foster AI has no
    // Liveblocks groups, so it is always empty.
    { userId: identity.userId, groupIds: [] },
    {
      userInfo: {
        name: user.fullName || identity.accessEmails[0] || "Unknown",
        avatar: user.imageUrl,
        color: getCursorColorForUser(identity.userId),
      },
    }
  );
  if (response.status !== 200) {
    console.error(
      `Liveblocks identifyUser failed for user ${identity.userId}:`,
      response.error,
    );
    return jsonError("Liveblocks authentication failed", 502);
  }

  return new Response(response.body, {
    status: response.status,
    headers: { "Content-Type": "application/json" },
  });
}

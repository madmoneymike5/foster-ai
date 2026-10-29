import { auth } from "@clerk/nextjs/server";

import {
  getLiveblocksClient,
  LIVEBLOCKS_REQUEST_TIMEOUT_MS,
} from "@/lib/liveblocks";
import { db } from "@/lib/prisma";
import { normalizeProjectName } from "@/lib/project-name";
import { isProjectId } from "@/lib/slug";

type ProjectRequestBody = {
  name?: string;
};

type ProjectRouteContext = {
  params: Promise<{ projectId: string }>;
};

/**
 * Narrow parsed JSON to the object shape accepted by the project API.
 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Parse and normalize the rename request body before ownership checks run.
 *
 * @param request - Incoming project-rename request.
 * @returns The trimmed name, an empty object for a missing field, or `null` for invalid input.
 */
async function readProjectBody(request: Request): Promise<ProjectRequestBody | null> {
  const text = await request.text();
  if (!text.trim()) return {};

  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return null;
  }

  if (!isRecord(body)) return null;
  if (!("name" in body)) return {};
  if (typeof body.name !== "string") return null;

  const name = normalizeProjectName(body.name);
  return name === null ? null : { name };
}

/**
 * Resolve and validate the dynamic project ID before querying the database.
 *
 * @param context - Next.js route context containing the promised path params.
 * @returns A valid project ID, or `null` for malformed path input.
 */
async function getProjectId(context: ProjectRouteContext): Promise<string | null> {
  const { projectId } = await context.params;
  return isProjectId(projectId) ? projectId : null;
}

/**
 * Renames an owned project for the authenticated Clerk user.
 */
export async function PATCH(request: Request, context: ProjectRouteContext) {
  const { userId } = await auth();
  if (!userId) {
    return Response.json({ error: "Authentication required" }, { status: 401 });
  }

  const projectId = await getProjectId(context);
  if (!projectId) {
    return Response.json({ error: "Invalid project ID" }, { status: 400 });
  }

  const body = await readProjectBody(request);
  if (!body || !("name" in body) || typeof body.name !== "string") {
    return Response.json(
      { error: "Request body must contain a project name of 1-200 characters after trimming" },
      { status: 400 },
    );
  }

  const project = await db.orm.public.Project.first({ id: projectId });
  if (!project) {
    return Response.json({ error: "Project not found" }, { status: 404 });
  }
  if (project.ownerId !== userId) {
    return Response.json({ error: "Project ownership required" }, { status: 403 });
  }
  if (project.status !== "DRAFT") {
    return Response.json({ error: "Project deletion is already in progress" }, { status: 409 });
  }

  const updatedProject = await db.orm.public.Project.where({
    id: projectId,
    ownerId: userId,
    status: "DRAFT",
  }).update({
    name: body.name,
  });
  if (!updatedProject) {
    return Response.json({ error: "Project not found" }, { status: 404 });
  }

  return Response.json({ project: updatedProject });
}

/**
 * Deletes an owned project for the authenticated Clerk user.
 */
export async function DELETE(_request: Request, context: ProjectRouteContext) {
  const { userId } = await auth();
  if (!userId) {
    return Response.json({ error: "Authentication required" }, { status: 401 });
  }

  const projectId = await getProjectId(context);
  if (!projectId) {
    return Response.json({ error: "Invalid project ID" }, { status: 400 });
  }

  const reservation = await db.transaction(async (tx) => {
    // Commit a durable reservation before the external room deletion. The
    // project row keeps its ID unique while room cleanup runs or is retried.
    const project = await tx.orm.public.Project.where({ id: projectId })
      .forNoKeyUpdate()
      .first();
    if (!project) {
      return Response.json({ error: "Project not found" }, { status: 404 });
    }
    if (project.ownerId !== userId) {
      return Response.json({ error: "Project ownership required" }, { status: 403 });
    }

    if (project.status === "DRAFT") {
      const reserved = await tx.orm.public.Project.where({
        id: projectId,
        ownerId: userId,
      }).update({ status: "ARCHIVED" });
      if (!reserved) {
        return Response.json({ error: "Project not found" }, { status: 404 });
      }
    }

    return null;
  });
  if (reservation) return reservation;

  try {
    // Auth rejects ARCHIVED projects, so no grant can recreate this room.
    // Liveblocks treats deleting a missing room as a successful no-op.
    await getLiveblocksClient().deleteRoom(projectId, {
      signal: AbortSignal.timeout(LIVEBLOCKS_REQUEST_TIMEOUT_MS),
    });
  } catch (error) {
    console.error(`Failed to delete Liveblocks room ${projectId}:`, error);
    return Response.json(
      { error: "Project room could not be deleted" },
      { status: 502 },
    );
  }

  return db.transaction(async (tx) => {
    const project = await tx.orm.public.Project.where({ id: projectId })
      .forNoKeyUpdate()
      .first();
    if (!project) {
      return Response.json({ error: "Project not found" }, { status: 404 });
    }
    if (project.ownerId !== userId) {
      return Response.json({ error: "Project ownership required" }, { status: 403 });
    }

    const deletedProject = await tx.orm.public.Project.where({
      id: projectId,
      ownerId: userId,
    }).delete();
    if (!deletedProject) {
      return Response.json({ error: "Project not found" }, { status: 404 });
    }

    return Response.json({ project: deletedProject });
  });
}

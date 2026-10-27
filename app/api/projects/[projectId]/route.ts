import { auth } from "@clerk/nextjs/server";

import { db } from "@/lib/prisma";
import { isProjectId } from "@/lib/slug";

type ProjectRequestBody = {
  name?: string;
};

type ProjectRouteContext = {
  params: Promise<{ projectId: string }>;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

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
  return typeof body.name === "string" ? { name: body.name } : null;
}

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
    return Response.json({ error: "Request body must contain a string name" }, { status: 400 });
  }

  const project = await db.orm.public.Project.first({ id: projectId });
  if (!project) {
    return Response.json({ error: "Project not found" }, { status: 404 });
  }
  if (project.ownerId !== userId) {
    return Response.json({ error: "Project ownership required" }, { status: 403 });
  }

  const updatedProject = await db.orm.public.Project.where({ id: projectId, ownerId: userId }).update({
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

  const project = await db.orm.public.Project.first({ id: projectId });
  if (!project) {
    return Response.json({ error: "Project not found" }, { status: 404 });
  }
  if (project.ownerId !== userId) {
    return Response.json({ error: "Project ownership required" }, { status: 403 });
  }

  const deletedProject = await db.orm.public.Project.where({ id: projectId, ownerId: userId }).delete();
  if (!deletedProject) {
    return Response.json({ error: "Project not found" }, { status: 404 });
  }

  return Response.json({ project: deletedProject });
}

import { auth } from "@clerk/nextjs/server";

import { db } from "@/lib/prisma";
import { generateProjectId, isProjectId } from "@/lib/slug";

type ProjectRequestBody = {
  name?: string;
  id?: string;
};

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
  if ("name" in body && typeof body.name !== "string") return null;
  if ("id" in body && typeof body.id !== "string") return null;
  return {
    name: "name" in body ? (body.name as string) : undefined,
    id: "id" in body ? (body.id as string) : undefined,
  };
}

/**
 * Lists projects owned by the authenticated Clerk user.
 */
export async function GET() {
  const { userId } = await auth();
  if (!userId) {
    return Response.json({ error: "Authentication required" }, { status: 401 });
  }

  const projects = await db.orm.public.Project.where({ ownerId: userId }).all();
  return Response.json({ projects });
}

/**
 * Creates a project for the authenticated Clerk user. The client supplies the
 * slug-based project/room ID (slug + short suffix, see lib/slug.ts) so the
 * create dialog can preview it before the request; a missing ID is generated
 * from the name server-side as a fallback.
 */
export async function POST(request: Request) {
  const { userId } = await auth();
  if (!userId) {
    return Response.json({ error: "Authentication required" }, { status: 401 });
  }

  const body = await readProjectBody(request);
  if (!body) {
    return Response.json({ error: "Request body must contain string name and id fields" }, { status: 400 });
  }
  if (body.id !== undefined && !isProjectId(body.id)) {
    return Response.json({ error: "Invalid project ID" }, { status: 400 });
  }

  const name = body.name ?? "Untitled Project";
  const projectId = body.id ?? generateProjectId(name);

  let project;
  try {
    project = await db.orm.public.Project.create({
      id: projectId,
      ownerId: userId,
      name,
    });
  } catch (error) {
    if (isUniqueViolation(error)) {
      return Response.json({ error: "A project with this ID already exists" }, { status: 409 });
    }
    throw error;
  }

  return Response.json({ project }, { status: 201 });
}

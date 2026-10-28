import { listCollaborators, normalizeEmail } from "@/lib/collaborators";
import { checkProjectAccess, getCurrentProjectIdentity } from "@/lib/project-access";
import { db } from "@/lib/prisma";
import { isProjectId } from "@/lib/slug";

type CollaboratorRouteContext = {
  params: Promise<{ projectId: string }>;
};

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

  const removed = await db.orm.public.ProjectCollaborator.where({ projectId, email }).delete();
  if (!removed) {
    return Response.json({ error: "Collaborator not found" }, { status: 404 });
  }

  return Response.json({ collaborator: removed });
}

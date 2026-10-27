import { currentUser } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";

import { EditorWorkspace } from "@/components/editor/editor-workspace";
import { AUTH_SIGN_IN_ROUTE } from "@/lib/auth-routes";
import { getOwnedProjects, getSharedProjects } from "@/lib/projects";

/**
 * The protected root of the signed-in app.
 *
 * Navigation protection is enforced upstream by `proxy.ts`; the `currentUser`
 * check below is the data-boundary guard (a stale or invalid session must not
 * render project data) and fails closed to the sign-in page.
 *
 * Owned and shared projects are fetched here, server-side, and passed to the
 * workspace as props — the client never fetches the initial lists.
 */
export default async function EditorPage() {
  const user = await currentUser();
  if (!user) {
    redirect(AUTH_SIGN_IN_ROUTE);
  }

  const ownedProjects = await getOwnedProjects(user.id);

  // Collaborators are matched by the user's primary email. Projects the user
  // owns are excluded so they appear once, under My Projects.
  const email = user.primaryEmailAddress?.emailAddress;
  const sharedProjects = email
    ? await getSharedProjects(email, ownedProjects.map((project) => project.id))
    : [];

  return <EditorWorkspace ownedProjects={ownedProjects} sharedProjects={sharedProjects} />;
}

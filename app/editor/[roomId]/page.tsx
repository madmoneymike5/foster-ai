import { redirect } from "next/navigation";

import { AccessDenied } from "@/components/editor/access-denied";
import { EditorWorkspace } from "@/components/editor/editor-workspace";
import { AUTH_SIGN_IN_ROUTE } from "@/lib/auth-routes";
import { checkProjectAccess, getCurrentProjectIdentity } from "@/lib/project-access";
import { getOwnedProjects, getSharedProjects } from "@/lib/projects";

/**
 * The per-project workspace shell (`/editor/[roomId]`).
 *
 * Access is decided server-side before anything renders: unauthenticated
 * callers redirect to sign-in, and a project the caller neither owns nor was
 * shared with — or that does not exist — renders `AccessDenied`. The sidebar
 * lists are only loaded after access is granted.
 */
export default async function WorkspacePage(props: PageProps<"/editor/[roomId]">) {
  const { roomId } = await props.params;

  const identity = await getCurrentProjectIdentity();
  if (!identity) {
    redirect(AUTH_SIGN_IN_ROUTE);
  }

  const access = await checkProjectAccess(roomId, identity);
  if (!access) {
    return <AccessDenied />;
  }

  const ownedProjects = await getOwnedProjects(identity.userId);
  const sharedProjects = identity.primaryEmail
    ? await getSharedProjects(identity.primaryEmail, ownedProjects.map((project) => project.id))
    : [];

  // The authorized project drives the navbar name and the sidebar highlight.
  // isShared mirrors ownership so a collaborator's row lands in the Shared
  // tab, where the defaultTab keeps it visible.
  const activeProject: (typeof ownedProjects)[number] = {
    id: access.project.id,
    name: access.project.name,
    isShared: !access.isOwner,
  };

  return (
    <EditorWorkspace
      ownedProjects={ownedProjects}
      sharedProjects={sharedProjects}
      activeProject={activeProject}
    />
  );
}

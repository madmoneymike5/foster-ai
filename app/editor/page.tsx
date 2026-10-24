import { EditorWorkspace } from "@/components/editor/editor-workspace";

/**
 * The protected root of the signed-in app.
 *
 * Route protection is enforced upstream by `proxy.ts` — unauthenticated
 * visitors never reach this page — so no `auth()` check is repeated here.
 */
export default function EditorPage() {
  return <EditorWorkspace />;
}

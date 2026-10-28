import Link from "next/link";
import { LockKeyhole } from "lucide-react";

import { buttonVariants } from "@/components/ui/button";

/**
 * Full-viewport denial state for `/editor/[roomId]`: shown when the signed-in
 * user does not own the project and was not shared with it. The same state
 * covers missing projects on purpose (project existence must not leak), so
 * the message never says "not found" specifically.
 */
export function AccessDenied() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-3 bg-base px-6 text-center">
      <LockKeyhole className="h-8 w-8 text-copy-faint" />
      <h1 className="text-lg font-semibold text-copy-primary">
        You don&apos;t have access to this project
      </h1>
      <p className="max-w-sm text-sm text-copy-muted">
        It may have been deleted, or you may need to be invited by its owner.
      </p>
      <Link href="/editor" className={buttonVariants({ variant: "outline", size: "sm" })}>
        Back to projects
      </Link>
    </div>
  );
}

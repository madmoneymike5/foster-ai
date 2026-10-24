import { SignIn } from "@clerk/nextjs";

import { AuthPage } from "@/components/auth/auth-page";

/**
 * Sign-in page (public — see `proxy.ts`). The optional catch-all folder
 * also serves Clerk's nested sign-in routes (e.g. password reset), and the
 * shared `AuthPage` provides the two-panel presentation.
 */
export default function SignInPage() {
  return (
    <AuthPage>
      <SignIn />
    </AuthPage>
  );
}

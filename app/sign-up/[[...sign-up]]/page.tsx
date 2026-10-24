import { SignUp } from "@clerk/nextjs";

import { AuthPage } from "@/components/auth/auth-page";

/**
 * Sign-up page (public — see `proxy.ts`). The optional catch-all folder
 * also serves Clerk's nested sign-up routes, and the shared `AuthPage`
 * provides the two-panel presentation.
 */
export default function SignUpPage() {
  return (
    <AuthPage>
      <SignUp />
    </AuthPage>
  );
}

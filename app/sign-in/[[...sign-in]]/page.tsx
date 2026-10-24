import { SignIn } from "@clerk/nextjs";

import { AuthPage } from "@/components/auth/auth-page";

export default function SignInPage() {
  return (
    <AuthPage>
      <SignIn />
    </AuthPage>
  );
}

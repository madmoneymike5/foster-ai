import { SignUp } from "@clerk/nextjs";

import { AuthPage } from "@/components/auth/auth-page";

export default function SignUpPage() {
  return (
    <AuthPage>
      <SignUp />
    </AuthPage>
  );
}

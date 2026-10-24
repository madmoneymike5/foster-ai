import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";

export default async function Home() {
  const { isAuthenticated } = await auth();
  redirect(
    isAuthenticated
      ? "/editor"
      : (process.env.NEXT_PUBLIC_CLERK_SIGN_IN_URL ?? "/sign-in"),
  );
}

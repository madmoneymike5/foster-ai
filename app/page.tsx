import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { AUTH_SIGN_IN_ROUTE } from "@/lib/auth-routes";

export default async function Home() {
  const { isAuthenticated } = await auth();
  redirect(isAuthenticated ? "/editor" : AUTH_SIGN_IN_ROUTE);
}

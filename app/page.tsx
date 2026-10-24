import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { AUTH_SIGN_IN_ROUTE } from "@/lib/auth-routes";

/**
 * `/` triage: signed-in visitors redirect to `/editor`, signed-out
 * visitors to the code-owned sign-in route. Nothing renders — the proxy
 * enforces the same destinations for direct navigation, so this page only
 * keeps `/` consistent.
 */
export default async function Home() {
  const { isAuthenticated } = await auth();
  redirect(isAuthenticated ? "/editor" : AUTH_SIGN_IN_ROUTE);
}

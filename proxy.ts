import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { AUTH_SIGN_IN_ROUTE, AUTH_SIGN_UP_ROUTE } from "@/lib/auth-routes";

// Public routes are code-owned (see lib/auth-routes.ts). Environment
// overrides of the Clerk sign-in / sign-up URLs must not drive
// authorization: a drifted value would open a nonexistent path while
// leaving the real form protected.
const isPublicRoute = createRouteMatcher([
  `${AUTH_SIGN_IN_ROUTE}(.*)`,
  `${AUTH_SIGN_UP_ROUTE}(.*)`,
]);
const isProjectApiRoute = createRouteMatcher(["/api/projects(.*)"]);

export default clerkMiddleware(
  async (auth, req) => {
    if (!isPublicRoute(req) && !isProjectApiRoute(req)) await auth.protect();
  },
  {
    // Explicit redirect target for auth.protect() so the SDK never
    // falls back to environment configuration for an authz-sensitive URL.
    signInUrl: AUTH_SIGN_IN_ROUTE,
    signUpUrl: AUTH_SIGN_UP_ROUTE,
  },
);

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};

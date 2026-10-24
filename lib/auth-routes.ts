/**
 * Canonical auth routes — code-owned, not environment configuration.
 * The implemented route folders (`app/sign-in`, `app/sign-up`) are the
 * source of truth; rename these constants in the same change as the folder.
 *
 * Everything authorization-sensitive must use these constants (the proxy's
 * public matcher, the `/` redirect, `clerkMiddleware`'s `signInUrl`/
 * `signUpUrl`): an env override that drifts from the real pages would open
 * a nonexistent path while leaving the forms protected (PR #2 finding).
 */
export const AUTH_SIGN_IN_ROUTE = "/sign-in";
export const AUTH_SIGN_UP_ROUTE = "/sign-up";

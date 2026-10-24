/**
 * Canonical auth routes, owned by code — not by environment configuration.
 *
 * The implemented page folders (`app/sign-in/[[...sign-in]]/`,
 * `app/sign-up/[[...sign-up]]/`) are the source of truth. If a route folder
 * is renamed, update these constants in the same change.
 *
 * Authorization-critical decisions (the proxy's public matcher, the
 * signed-out redirect, and Clerk middleware's `protect()` redirect target)
 * must use these constants. Environment overrides of the Clerk sign-in /
 * sign-up URLs must never drive authorization: a drifted env value would
 * otherwise open a nonexistent path while leaving the real form protected
 * (CodeRabbit finding, PR #2).
 */
export const AUTH_SIGN_IN_ROUTE = "/sign-in";
export const AUTH_SIGN_UP_ROUTE = "/sign-up";

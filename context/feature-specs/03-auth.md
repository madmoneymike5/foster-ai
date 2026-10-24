Clerk is already installed and connected. Wire it into the Next.js app: provider, auth pages, redirects, route protection, and user menu.

## Design

Use Clerk’s `dark` theme from `@clerk/ui/themes` as the base.

Override Clerk appearance variables using the app’s existing CSS variables. Do not hardcode colors.

Sign-in and sign-up pages:

- large screens: simple two-panel layout
- left: compact logo, tagline, short text-only feature list
- right: centered Clerk form
- small screens: form only
- no gradients
- no oversized hero sections
- no feature cards
- no scroll-heavy layouts

Keep the layout minimal and professional.

## Implementation

Wrap the root layout with `ClerkProvider` using Clerk’s `dark` theme.

Create sign-in and sign-up pages using Clerk components.

Use `proxy.ts` at the project root, not `middleware.ts`.

Define public routes from the code-owned constants in `lib/auth-routes.ts` (`AUTH_SIGN_IN_ROUTE`, `AUTH_SIGN_UP_ROUTE`), matching the implemented `app/sign-in` and `app/sign-up` route folders. Pass the same constants as `signInUrl`/`signUpUrl` options to `clerkMiddleware` so `auth.protect()`'s redirect target is also code-owned. Protect everything else by default.

> Correction (2026-10-24, PR #2 CodeRabbit finding): this originally required deriving the public matcher from `NEXT_PUBLIC_CLERK_SIGN_IN_URL` / `NEXT_PUBLIC_CLERK_SIGN_UP_URL`. That let an env override open a nonexistent path while leaving the real form protected — authorization must not depend on mutable environment configuration.

Update `/`:

- authenticated users redirect to `/editor`
- unauthenticated users redirect to `/sign-in`

Add Clerk’s built-in `UserButton` to the editor navbar right section for profile settings and logout.

Keep Clerk’s default user menu and profile flows intact. Do not rebuild or heavily customize Clerk internals.

Use existing Clerk env vars. Do not rename or invent new ones. The sign-in / sign-up URL vars remain for the SDK's client-side bootstrap only (e.g. the form cross-links); they are UI configuration, not authorization — authorization-sensitive routing must use `lib/auth-routes.ts`.

## Dependencies

install: @clerk/ui.

## Check When Done

- `proxy.ts` exists at the root
- all routes are protected except public auth paths
- auth pages use CSS variables with no hardcoded colors
- `ClerkProvider` wraps the root layout
- `npm run build` passes

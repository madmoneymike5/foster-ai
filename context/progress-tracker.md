# Progress Tracker

Update this file whenever the current phase, active feature, or implementation state changes.

## Current Phase

- Phase 1: Design system foundation complete
- Phase 2: Editor chrome complete
- Phase 2.5: Clerk foundation installed (application linked, provider, proxy, auth pages, header chrome)
- Phase 3: Clerk authentication feature integration (spec 03) complete

## Current Goal

- Move to the next feature spec (04 — project dialogs).

## Completed

- Read the project, architecture, UI, code standards, workflow, and design-system feature context.
- Established the local Git baseline and linked worktree at `/home/sarah-taylor/Dev/worktrees/foster-ai--f5ed78e5/design-system`.
- Initialized shadcn/ui and added Button, Card, Dialog, Input, Tabs, Textarea, and ScrollArea.
- Installed `lucide-react`, `clsx`, and `tailwind-merge`.
- Added the shared `cn()` helper in `lib/utils.ts`.
- Replaced the generated light theme with the dark-only project tokens and enabled the `dark` root class.
- Verified lint, TypeScript, production build, `cn()` Tailwind conflict merging, and diff cleanliness.
- Clerk foundation installed (committed to `main`, worktree `clerk-setup` removed after verification; feature integration now in progress on `feature/auth`):
  - Linked the project to the existing Clerk application **Foster AI** (`app_3L7GPY3tqiqITsUp3BEUDpg6qoY`) via the Clerk CLI; no new or accountless application was created.
  - `@clerk/nextjs@^7.9.20` (current SDK generation): `ClerkProvider` wraps body content in `app/layout.tsx`; `proxy.ts` runs `clerkMiddleware()`; sign-in/sign-up catch-all pages at `/sign-in` and `/sign-up`.
  - Layout header (h-12, `bg-surface`, `border-surface-border`) shows the wordmark plus `SignInButton`/`SignUpButton` when signed out and `UserButton` when signed in.
  - shadcn/ui theming: `@clerk/ui` installed, `appearance={{ theme: shadcn }}` on `ClerkProvider`, `@import "@clerk/ui/themes/shadcn.css"` in `globals.css`.
  - Development keys for the app live in `.env.local` (gitignored) in the primary checkout; `next.config.ts` does not enable `cacheComponents`, so no Suspense wrappers are required for request-reading Clerk components. Next 16 uses `proxy.ts`, not `middleware.ts`.
  - Verified: lint, `tsc --noEmit` (after `next build` generated route types), production build (routes `/`, `/sign-in`, `/sign-up` + Proxy), `clerk doctor` green, and live dev-server render of the header controls and prebuilt sign-in page (GitHub/Google/email-password).
  - Clerk init's post-setup note: routes are public by default — protect pages, Route Handlers, and Server Actions individually with `await auth.protect()` as features land.
- Implemented feature spec 03 (auth) on branch `feature/auth`, merged to `main` (fast-forward):
  - `proxy.ts` — protected-first: `clerkMiddleware` + `createRouteMatcher`; public routes built from `NEXT_PUBLIC_CLERK_SIGN_IN_URL` / `NEXT_PUBLIC_CLERK_SIGN_UP_URL` (catch-all `(.*)` so nested Clerk routes stay public); everything else goes through `await auth.protect()`.
  - `app/layout.tsx` — `ClerkProvider` now wraps the whole root layout with `theme: dark` from `@clerk/ui/themes`; all appearance variables overridden with app CSS variables (`var(--accent-primary)`, `var(--bg-surface)`, `var(--border-default)`, `var(--state-*)`, `var(--font-geist-sans)`, `var(--radius)`); no hardcoded colors. The interim global header (wordmark + sign-in/out buttons) was removed — the app chrome is the editor navbar.
  - `components/auth/auth-page.tsx` — shared two-panel auth layout: left panel (compact logo, "More with less." tagline, 4-item text-only feature list) on large screens only (`hidden lg:flex`), centered Clerk form on the right; form-only below `lg`. No gradients, no hero, no cards.
  - `app/sign-in/[[...sign-in]]/page.tsx`, `app/sign-up/[[...sign-up]]/page.tsx` — `SignIn`/`SignUp` wrapped in `AuthPage`.
  - `app/page.tsx` — server redirect: authenticated → `/editor`, unauthenticated → the sign-in env route (middleware enforces the same redirect for signed-out visitors).
  - `components/editor/editor-navbar.tsx` — Clerk `UserButton` added to the right section; default Clerk user menu/profile flows untouched.
  - `app/editor/page.tsx` + `components/editor/editor-workspace.tsx` — minimal protected `/editor` route (navbar with sidebar state + `ProjectSidebar` + empty canvas area) so the authenticated redirect target exists; canvas behavior remains a later spec.
  - `app/globals.css` — removed the now-unneeded `@import "@clerk/ui/themes/shadcn.css"` (the `dark` theme carries its own values; no CSS theme import is shipped for it).
  - Root metadata updated to "Foster AI" (was the generated "Create Next App" placeholder).
- Implemented feature spec 02 (editor chrome) on branch `feature/editor-chrome`:
  - `components/editor/editor-navbar.tsx` — client component, fixed-height (`h-12`) top navbar with left/center/right sections, sidebar toggle using `PanelLeftOpen`/`PanelLeftClose` driven by `isSidebarOpen`, `aria-label`/`aria-expanded` on the icon-only toggle, empty center and right sections, `bg-surface` background with `border-surface-border` bottom border.
  - `components/editor/project-sidebar.tsx` — client component, absolutely positioned floating overlay (`absolute inset-y-0 left-0`) so opening it never pushes page content, transform-based left slide-in (`translate-x` + `transition-transform`), `inert` and `aria-hidden` while closed, `Projects` header with close button, shadcn `Tabs` for "My Projects" and "Shared" with empty placeholder states, full-width `New Project` button with `Plus` icon at the bottom (optional `onNewProject` callback, unwired until a later spec).
- Verified the dialog pattern: the generated `components/ui/dialog.tsx` already exports `DialogTitle`, `DialogDescription`, and `DialogFooter`, with all colors resolved through `globals.css` tokens (`bg-popover`, `text-popover-foreground`, `border-border`, `bg-muted/50`). No new dialog component was built, per spec.

## In Progress

- None.

## Next Up

- Implement feature spec 04 (project dialogs).

## Open Questions

- None for this feature unit.

## Verification Evidence (spec 03)

- `npm run lint`, `npx tsc --noEmit`, and `npm run build` (Next 16.3.4, Turbopack) all clean in the worktree; build output routes: `ƒ /`, `○ /editor`, `ƒ /sign-in/[[...sign-in]]`, `ƒ /sign-up/[[...sign-up]]` + Proxy.
- Live checks against the 3001 dev service (post-merge), signed out: `/` → 307 to `/sign-in?redirect_url=…/`, `/editor` → 307 to `/sign-in`, `/sign-in` and `/sign-up` → 200.
- Signed in (temporary API-created session for the existing dev user, revoked after the test; dev-instance handshake cookies `__session` + `__client_uat` + `__clerk_db_jwt`): `/` → 307 to `/editor`, `/editor` → 200.
- `UserButton` code present in the `/editor` page's served JS chunks (Clerk prebuilt components render client-side in this SDK generation, so SSR HTML shows only the app chrome).
- Headless-browser render of `/sign-in` and `/sign-up` on 3001: both show the left branding/feature panel and Clerk's full form (GitHub/Google/email-password, sign-in ↔ sign-up links, "Foster AI" tab title).
- Auth pages and appearance config contain no hardcoded colors — only `var(--…)` references and project Tailwind tokens.
- No `components/ui/*` files were modified.

## Architecture Decisions

- This feature adds reusable UI primitives and styling infrastructure only; it does not change application data boundaries or storage.
- The project sidebar uses `absolute` positioning so it floats over the editor canvas inside the workspace's relative container. `z-40` keeps it above the canvas and below dialog overlays (`z-50`).
- Route protection is protected-first in `proxy.ts` (public routes are the env-defined auth paths only); pages and future Route Handlers/Server Actions still need their own `await auth()`/ownership checks per `architecture-context.md` invariants — the proxy protects navigation, not data access.
- `/editor` currently renders only the navbar + projects sidebar around an empty canvas area; it exists so the spec 03 authenticated redirect has a valid target. Spec 04 (project dialogs) wires the sidebar's `New Project` button; the canvas itself lands later.

## Session Notes

- Clerk setup was done in the linked worktree `/home/sarah-taylor/Dev/worktrees/foster-ai--f5ed78e5/clerk-setup` on branch `feature/clerk-setup`, merged to `main`, and the worktree removed with `git wt remove --confirmed-integrated` (branch is ahead of `origin/main`, which has no remote in the local baseline repo).
- The `NEXT_PUBLIC_CLERK_*` route URL env vars and development keys were written to `.env.local` in the worktree, then copied to the primary checkout; the file is gitignored in both.
- Dev server hostname constraint (documented in `~/.config/systemd/user/foster-ai.service`): the persistent `foster-ai.service` must run `next dev -H localhost -p 3001`, **not** `-H 127.0.0.1`. Clerk's dev handshake rewrites the request to `http://localhost:3001`; with a `127.0.0.1` bind, Next sees a different origin and self-proxies that rewrite into itself, 500ing every route (`Failed to proxy https://localhost:3001/` + EPROTO in the journal). Both `http://localhost:3001` and the tailnet Caddy TLS proxy (`https://sarah-taylor.tail1644ec.ts.net:3001` → `127.0.0.1:3001`) render correctly under the `localhost` bind. Never `rm -rf .next` under the running service.
- Tailnet dev-origin fix: `next.config.ts` now includes `sarah-taylor.tail1644ec.ts.net` in `allowedDevOrigins`. Without it, Next rejected the proxied `/\_next/hmr` WebSocket with upstream `Unauthorized` (Caddy returned 502), which stalled Clerk's automatic client initialization on the tailnet even though Clerk's handshake and direct API calls succeeded. After the config change and service restart, the tailnet reaches `Clerk.loaded === true`, `/sign-in` and `/sign-up` render their full forms, and header buttons navigate correctly.
- Before production: claim/verify the app from the Clerk Dashboard and configure the production instance (`npx -y clerk@latest deploy`); temporary/development keys are not production-ready.
- Feature spec 02 was implemented in the linked worktree at `/home/sarah-taylor/Dev/worktrees/foster-ai--f5ed78e5/editor-chrome` on branch `feature/editor-chrome`.
- Feature spec 03 was implemented in the linked worktree at `/home/sarah-taylor/Dev/worktrees/foster-ai--f5ed78e5/auth` on branch `feature/auth`, fast-forward merged to `main`, and the worktree removed after verification.
- Signed-in live testing on the dev instance requires the 2026 Clerk cookie protocol: a dev-browser handshake token (`__clerk_db_jwt`, from `GET https://<dev-instance>.clerk.accounts.dev/v1/client/handshake?domain=…&redirect_url=…`), the session JWT in `__session`, and its `iat` in `__client_uat`. Session tokens from `POST /v1/sessions/{id}/tokens` expire after ~60s — mint and use in the same command. A plain `Authorization: Bearer` header or `ck` header is not accepted by the middleware in this generation.
- The removed global layout header was the interim chrome from the initial Clerk setup; per spec 03 the user menu lives in the editor navbar.
- The original checkout had an empty `.git` directory, so a local baseline repository was initialized before implementation. The completed design-system commit was merged into `main`, and the temporary linked worktree was removed after verification.
- Generated `components/ui/*` files were created by the shadcn CLI and left unmodified afterward.
- CSS LSP warnings for Tailwind v4 directives were marked false positives. A generated `scroll-area.tsx` unused-import hint was deferred without changing the generated file.

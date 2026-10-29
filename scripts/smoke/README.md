# Authenticated smoke tests

Authenticated feature smoke tests use the shared Clerk actor helper in
`clerk-actors.mjs`.

## Required pattern

1. Create one isolated actor context per Clerk user.
2. Make app requests with `actor.fetch(...)`.
3. Let the helper inspect and renew the copied localhost session before each
   request.
4. Keep fixture creation and cleanup in the runner's `try`/`finally` flow.
5. Use exact fixture IDs, email prefixes, and organization prefixes for cleanup.

The helper intentionally renews the development session. Clerk's development
handshake gives the test an approximately 60-second `__session` JWT on the
accounts domain. The test copies that token to `localhost`, where Clerk cannot
refresh it automatically. Do not copy a cookie once and reuse it for a whole
suite.

## Prohibited patterns

- Do not import Playwright from an `npx` cache or an absolute machine path.
- Do not send a frozen `Cookie` header from Node `fetch` for the duration of a
  suite.
- Do not duplicate impersonation-ticket, JWT-expiry, or cookie-renewal logic in
  a feature runner.
- Do not weaken production Clerk middleware or route authentication to make a
  smoke test pass.
- Do not delete database rows by a broad name or prefix when an exact generated
  fixture ID is available.

## Prerequisites

Before running the commands below on a fresh checkout:

- Install dependencies with `npm install`.
- Install Playwright's Chromium browser once with `npx playwright install chromium`.
- Install the Clerk CLI and make sure the `clerk` command is on `PATH`; the
  shared actor helper uses it to create impersonation tickets.
- Set `CLERK_SECRET_KEY`, `LIVEBLOCKS_SECRET_KEY`, and `DATABASE_URL` in the
  repository's `.env.local`; `spec10.mjs` reads these values directly.
- Start the development server at `http://localhost:3005`, or set
  `SMOKE_APP_URL` to the address of a running server.

## Commands

```text
npm run test:smoke-helper
npm run smoke:spec10
npm run smoke:spec10:expiry
```

The expiry command intentionally waits beyond the initial JWT lifetime and
verifies that the shared helper renews each actor successfully. It is a
regression check, not a required delay for every feature run.

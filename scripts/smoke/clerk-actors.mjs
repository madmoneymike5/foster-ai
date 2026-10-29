import { execFileSync } from "node:child_process";

export const RENEWAL_THRESHOLD_SECONDS = 15;

/**
 * Decides whether a short-lived Clerk session needs replacement before a request.
 *
 * @param {number} expiresAt - JWT expiration time in Unix seconds.
 * @param {number} [nowSeconds] - Current Unix time, injectable for boundary checks.
 * @returns {boolean} Whether the session is expired or inside the renewal window.
 */
export function shouldRenewSession(
  expiresAt,
  nowSeconds = Math.floor(Date.now() / 1000),
) {
  return expiresAt - nowSeconds < RENEWAL_THRESHOLD_SECONDS;
}

/**
 * Decodes a JWT payload for expiry inspection in the smoke harness.
 *
 * @param {string} token - A JWT returned by Clerk or Liveblocks.
 * @returns {Record<string, unknown>} The decoded payload.
 */
export function decodeJwtPayload(token) {
  const segment = token.split(".")[1];
  if (!segment) throw new Error("Expected a JWT with a payload segment");
  try {
    return JSON.parse(Buffer.from(segment, "base64url").toString("utf8"));
  } catch {
    throw new Error("Expected a JWT with a JSON payload");
  }
}

/**
 * Creates an authenticated Clerk Backend API caller for fixture lifecycle work.
 *
 * @param {{ clerkSecret: string }} options - Clerk credentials.
 * @returns {(path: string, init?: RequestInit) => Promise<unknown>} A Clerk API caller.
 */
export function createClerkApi({ clerkSecret }) {
  return async function clerkApi(path, init = {}) {
    const response = await fetch(`https://api.clerk.com${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${clerkSecret}`,
        "Content-Type": "application/json",
        ...(init.headers || {}),
      },
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(
        `Clerk API ${path} -> ${response.status}: ${JSON.stringify(body).slice(0, 300)}`,
      );
    }
    return body;
  };
}

function getImpersonationTicket({ repo, clerkSecret, userId }) {
  const output = execFileSync(
    "clerk",
    ["impersonate", userId, "--print", "--yes", "--expires-in", "3600"],
    {
      env: { ...process.env, CLERK_SECRET_KEY: clerkSecret },
      cwd: repo,
      encoding: "utf8",
    },
  );
  try {
    return JSON.parse(output).url;
  } catch {
    return output
      .split("\n")
      .map((line) => line.trim())
      .find((line) => line.startsWith("http"));
  }
}

async function seedAppCookies(context, appUrl, accountCookies) {
  const session = accountCookies.find((cookie) => cookie.name === "__session");
  const dbJwt = accountCookies.find((cookie) => cookie.name === "__clerk_db_jwt");
  if (!session?.value || !dbJwt?.value) throw new Error("Missing Clerk session cookies");

  const claims = decodeJwtPayload(session.value);
  await context.addCookies([
    { name: "__session", value: session.value, url: appUrl, httpOnly: true, sameSite: "Lax" },
    { name: "__client_uat", value: String(claims.iat), url: appUrl, httpOnly: true, sameSite: "Lax" },
    { name: "__clerk_db_jwt", value: dbJwt.value, url: appUrl, httpOnly: true, sameSite: "Lax" },
  ]);
  return claims;
}

async function openAuthenticatedPage({ actor, ticket, appUrl, orgPrefix }) {
  const authPage = await actor.context.newPage();
  try {
    await authPage.goto(ticket, { waitUntil: "domcontentloaded" });
    try {
      await authPage.waitForSelector('input[type="text"], input:not([type])', { timeout: 8000 });
      await authPage.locator('input[type="text"], input:not([type])').first().fill(`${orgPrefix} ${actor.role}`);
      await authPage.getByRole("button", { name: /continue/i }).first().click();
    } catch {
      // Existing organization/session state can skip organization setup.
    }
    await authPage.waitForURL(/default-redirect/, { timeout: 30000 });
    const claims = await seedAppCookies(
      actor.context,
      appUrl,
      await actor.context.cookies(authPage.url()),
    );
    return claims;
  } finally {
    await authPage.close();
  }
}

/**
 * Creates isolated browser actors whose app requests renew copied Clerk cookies.
 *
 * Clerk's development handshake gives the harness a short-lived session JWT on
 * the accounts domain. Because the app is tested at localhost, the harness must
 * copy that token to localhost; Clerk cannot refresh that copied cookie itself.
 * The actor renews it before expiry, then performs requests through its own page.
 *
 * @param {{ browser: object, appUrl: string, clerkSecret: string, repo: string, orgPrefix: string }} options - Harness configuration.
 * @returns {{ signIn: (role: string, userId: string) => Promise<object>, close: () => Promise<void> }} Actor manager.
 */
export function createClerkActorManager({ browser, appUrl, clerkSecret, repo, orgPrefix }) {
  const actors = new Set();

  async function signIn(role, userId) {
    const context = await browser.newContext();
    const actor = {
      role,
      userId,
      context,
      page: await context.newPage(),
      renewalPromise: null,
      async renew() {
        if (actor.renewalPromise) return actor.renewalPromise;
        actor.renewalPromise = (async () => {
          const ticket = getImpersonationTicket({ repo, clerkSecret, userId });
          if (!ticket) throw new Error(`No Clerk impersonation ticket for ${role}`);
          const claims = await openAuthenticatedPage({ actor, ticket, appUrl, orgPrefix });
          return claims;
        })();
        try {
          return await actor.renewalPromise;
        } finally {
          actor.renewalPromise = null;
        }
      },
      async fetch(path, init = {}) {
        await ensureFresh(actor);
        const request = {
          method: init.method || "GET",
          body: init.body || null,
          headers: init.headers || {},
        };
        return actor.page.evaluate(async ({ requestPath, requestInit }) => {
          const response = await fetch(requestPath, {
            method: requestInit.method,
            body: requestInit.body,
            credentials: "include",
            cache: "no-store",
            headers: { "Content-Type": "application/json", ...requestInit.headers },
          });
          const text = await response.text();
          let body = null;
          try { body = JSON.parse(text); } catch {}
          return { status: response.status, body };
        }, { requestPath: path, requestInit: request });
      },
    };

    const ticket = getImpersonationTicket({ repo, clerkSecret, userId });
    if (!ticket) {
      await context.close();
      throw new Error(`No Clerk impersonation ticket for ${role}`);
    }

    try {
      await openAuthenticatedPage({ actor, ticket, appUrl, orgPrefix });
      await actor.page.goto(`${appUrl}/editor`, { waitUntil: "commit" });
      await actor.page.waitForLoadState("domcontentloaded", { timeout: 15000 }).catch(() => undefined);
      if (actor.page.url().includes("/sign-in")) {
        throw new Error(`${role}: app rejected the seeded Clerk session`);
      }
      await actor.page
        .waitForFunction(() => Boolean(globalThis.Clerk?.loaded), undefined, { timeout: 15000 })
        .catch(() => undefined);
      actors.add(actor);
      return actor;
    } catch (error) {
      await context.close();
      throw error;
    }
  }

  async function ensureFresh(actor) {
    const appCookies = await actor.context.cookies(appUrl);
    const session = appCookies.find((cookie) => cookie.name === "__session");
    if (!session?.value) {
      await actor.renew();
      return;
    }
    const claims = decodeJwtPayload(session.value);
    if (typeof claims.exp !== "number" || shouldRenewSession(claims.exp)) {
      await actor.renew();
    }
  }

  return {
    signIn,
    async close() {
      for (const actor of actors) await actor.context.close().catch(() => undefined);
      actors.clear();
    },
  };
}

/**
 * Deletes temporary Clerk users and organizations created by a smoke runner.
 *
 * @param {{ clerkApi: (path: string, init?: RequestInit) => Promise<unknown>, userIds: Record<string, string>, orgPrefix: string }} options - Fixture identifiers.
 * @returns {Promise<void>} Resolves after best-effort cleanup.
 */
export async function cleanupClerkFixtures({ clerkApi, userIds, orgPrefix }) {
  for (const userId of Object.values(userIds)) {
    if (userId) await clerkApi(`/v1/users/${userId}`, { method: "DELETE" }).catch(() => undefined);
  }
  const organizations = await clerkApi("/v1/organizations").catch(() => []);
  const list = Array.isArray(organizations) ? organizations : organizations.data || [];
  for (const organization of list) {
    if (organization.name?.startsWith(orgPrefix)) {
      await clerkApi(`/v1/organizations/${organization.id}`, { method: "DELETE" }).catch(() => undefined);
    }
  }
}

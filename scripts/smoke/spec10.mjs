import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { chromium } from "playwright";
import pg from "pg";

import {
  cleanupClerkFixtures,
  createClerkActorManager,
  createClerkApi,
  decodeJwtPayload,
} from "./clerk-actors.mjs";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "../..");
const APP = process.env.SMOKE_APP_URL || "http://localhost:3005";

function env(name) {
  const line = readFileSync(join(REPO, ".env.local"), "utf8")
    .split("\n")
    .find((entry) => entry.startsWith(`${name}=`));
  if (!line) throw new Error(`missing env ${name}`);
  return line.slice(name.length + 1).replace(/^["']|["']$/g, "");
}

const CLERK_SECRET = env("CLERK_SECRET_KEY");
const LIVEBLOCKS_SECRET = env("LIVEBLOCKS_SECRET_KEY");
const DATABASE_URL = env("DATABASE_URL");
const clerkApi = createClerkApi({ clerkSecret: CLERK_SECRET });
const results = [];
const userIds = {};
const actors = {};
const timestamp = Date.now();
const suffix = Math.random().toString(36).slice(2, 8);
const orgPrefix = `Spec10 ${timestamp} ${suffix}`;
const emails = {
  owner: `spec10-owner-${timestamp}-${suffix}@example.com`,
  collab: `spec10-collab-${timestamp}-${suffix}@example.com`,
  outsider: `spec10-out-${timestamp}-${suffix}@example.com`,
};
const projectId = `spec10-smoke-${suffix}`;
const password = `Spec10smoke!${timestamp}`;
let browser;
let actorManager;
let projectCreated = false;
let roomCreated = false;

function check(name, ok, detail = "") {
  results.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  — ${detail}` : ""}`);
}

function fnvColor(userId) {
  const palette = [
    "#00c8d4", "#8b82ff", "#34d399", "#fbbf24", "#ff4d4f",
    "#60a5fa", "#f472b6", "#a3e635", "#22d3ee", "#fb923c",
  ];
  let hash = 0x811c9dc5;
  for (let index = 0; index < userId.length; index++) {
    hash ^= userId.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return palette[(hash >>> 0) % palette.length];
}

async function liveblocksApi(path, init = {}) {
  const response = await fetch(`https://api.liveblocks.io/v2${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${LIVEBLOCKS_SECRET}`,
      ...(init.headers || {}),
    },
  });
  const body = await response.json().catch(() => null);
  return { status: response.status, body };
}

async function anonymousAppFetch(path, init = {}) {
  const response = await fetch(`${APP}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init.headers || {}) },
  });
  const text = await response.text();
  let body = null;
  try { body = JSON.parse(text); } catch {}
  return { status: response.status, body };
}

async function createFixtureUsers() {
  for (const role of ["owner", "collab", "outsider"]) {
    const user = await clerkApi("/v1/users", {
      method: "POST",
      body: JSON.stringify({ email_address: [emails[role]], password }),
    });
    userIds[role] = user.id;
  }
}

async function deleteProjectDirectly() {
  const client = new pg.Client({ connectionString: DATABASE_URL });
  await client.connect();
  await client.query('DELETE FROM "Project" WHERE id = $1', [projectId]);
  await client.end();
}

async function checkDatabaseCleanup() {
  const client = new pg.Client({ connectionString: DATABASE_URL });
  await client.connect();
  const projectRows = await client.query(
    'SELECT count(*)::int AS n FROM "Project" WHERE id = $1',
    [projectId],
  );
  const collaboratorRows = await client.query(
    'SELECT count(*)::int AS n FROM "ProjectCollaborator" WHERE "projectId" = $1',
    [projectId],
  );
  await client.end();
  check(
    "cleanup: 0 DB rows for fixture",
    projectRows.rows[0].n === 0 && collaboratorRows.rows[0].n === 0,
    `Project=${projectRows.rows[0].n} ProjectCollaborator=${collaboratorRows.rows[0].n}`,
  );
}

try {
  browser = await chromium.launch();
  await createFixtureUsers();
  actorManager = createClerkActorManager({
    browser,
    appUrl: APP,
    clerkSecret: CLERK_SECRET,
    repo: REPO,
    orgPrefix,
  });
  for (const role of ["owner", "collab", "outsider"]) {
    actors[role] = await actorManager.signIn(role, userIds[role]);
  }
  console.log("all three isolated Playwright contexts remain open");

  if (process.argv.includes("--force-expiry")) {
    console.log("waiting 65s to cross the initial Clerk JWT expiry...");
    await actors.owner.page.waitForTimeout(65000);
  }

  let response = await anonymousAppFetch(
    "/api/liveblocks-auth",
    { method: "POST", body: JSON.stringify({ room: projectId }) },
  );
  check("unauthenticated -> 401 JSON", response.status === 401 && !!response.body?.error, `status=${response.status}`);

  response = await actors.owner.fetch("/api/projects", {
    method: "POST",
    body: JSON.stringify({ name: "Spec10 Smoke", id: projectId }),
  });
  projectCreated = response.status === 201;
  check("owner creates project", projectCreated && response.body?.project?.id === projectId, `status=${response.status}`);

  // The route upserts the room before it asks Liveblocks to issue the token.
  // Cleanup must therefore try to delete it even if token issuance fails.
  roomCreated = true;
  response = await actors.owner.fetch("/api/liveblocks-auth", {
    method: "POST",
    body: JSON.stringify({ room: projectId }),
  });
  const ownerToken = response.body?.token;
  check("owner token issued", response.status === 200 && typeof ownerToken === "string" && ownerToken.split(".").length === 3, `status=${response.status}`);
  if (ownerToken) {
    const metadata = decodeJwtPayload(ownerToken).ui || {};
    check("owner token carries name", typeof metadata.name === "string" && metadata.name.length > 0, `name=${metadata.name}`);
    check("owner token carries avatar", typeof metadata.avatar === "string", `avatar=${JSON.stringify(metadata.avatar)}`);
    check("owner token carries expected cursor color", metadata.color === fnvColor(userIds.owner), `color=${metadata.color} expected=${fnvColor(userIds.owner)}`);
  }

  let room = await liveblocksApi(`/rooms/${projectId}`);
  check("room created (private)", room.status === 200 && Array.isArray(room.body?.defaultAccesses) && room.body.defaultAccesses.length === 0, `status=${room.status} defaultAccesses=${JSON.stringify(room.body?.defaultAccesses)}`);
  check("room has owner write grant", JSON.stringify(room.body?.usersAccesses?.[userIds.owner]) === JSON.stringify(["*:write"]), `usersAccesses=${JSON.stringify(room.body?.usersAccesses)}`);

  response = await actors.owner.fetch("/api/liveblocks-auth", { method: "POST", body: JSON.stringify({}) });
  check("missing room -> 400", response.status === 400, `status=${response.status}`);
  response = await actors.owner.fetch("/api/liveblocks-auth", { method: "POST", body: JSON.stringify({ room: "bad..id" }) });
  check("malformed room -> 400", response.status === 400, `status=${response.status}`);
  response = await actors.owner.fetch("/api/liveblocks-auth", { method: "POST", body: "not json" });
  check("invalid JSON body -> 400", response.status === 400, `status=${response.status}`);

  response = await actors.owner.fetch(`/api/projects/${projectId}/collaborators`, {
    method: "POST",
    body: JSON.stringify({ email: emails.collab }),
  });
  check("owner invites collaborator", response.status === 200 || response.status === 201, `status=${response.status}`);

  response = await actors.collab.fetch("/api/liveblocks-auth", {
    method: "POST",
    body: JSON.stringify({ room: projectId }),
  });
  const collaboratorToken = response.body?.token;
  check("collaborator token issued (existing room)", response.status === 200 && typeof collaboratorToken === "string", `status=${response.status}`);

  room = await liveblocksApi(`/rooms/${projectId}`);
  check("room grants merged for collaborator", JSON.stringify(room.body?.usersAccesses?.[userIds.collab]) === JSON.stringify(["*:write"]) && JSON.stringify(room.body?.usersAccesses?.[userIds.owner]) === JSON.stringify(["*:write"]), `usersAccesses=${JSON.stringify(room.body?.usersAccesses)}`);
  check("room still private", room.body?.defaultAccesses?.length === 0, `defaultAccesses=${JSON.stringify(room.body?.defaultAccesses)}`);

  response = await actors.owner.fetch(`/api/projects/${projectId}/collaborators`, {
    method: "DELETE",
    body: JSON.stringify({ email: emails.collab }),
  });
  check("owner removes collaborator", response.status === 200, `status=${response.status}`);

  room = await liveblocksApi(`/rooms/${projectId}`);
  check(
    "removed collaborator room grant revoked",
    !Object.hasOwn(room.body?.usersAccesses || {}, userIds.collab) &&
      JSON.stringify(room.body?.usersAccesses?.[userIds.owner]) === JSON.stringify(["*:write"]),
    `usersAccesses=${JSON.stringify(room.body?.usersAccesses)}`,
  );

  response = await actors.collab.fetch("/api/liveblocks-auth", {
    method: "POST",
    body: JSON.stringify({ room: projectId }),
  });
  check("removed collaborator cannot get another token", response.status === 403, `status=${response.status}`);

  response = await actors.outsider.fetch("/api/liveblocks-auth", {
    method: "POST",
    body: JSON.stringify({ room: projectId }),
  });
  check("non-member -> 403", response.status === 403 && !!response.body?.error, `status=${response.status}`);
  response = await actors.outsider.fetch("/api/liveblocks-auth", {
    method: "POST",
    body: JSON.stringify({ room: `no-such-project-${suffix}` }),
  });
  check("missing room (outsider) -> 403 (no existence leak)", response.status === 403, `status=${response.status}`);
  response = await actors.owner.fetch("/api/liveblocks-auth", {
    method: "POST",
    body: JSON.stringify({ room: `no-such-project-${suffix}` }),
  });
  check("missing room (owner) -> 403", response.status === 403, `status=${response.status}`);

  response = await actors.owner.fetch(`/api/projects/${projectId}`, { method: "DELETE" });
  const projectDeleted = response.status === 200 || response.status === 204;
  check("cleanup: project deleted", projectDeleted, `status=${response.status}`);
  if (projectDeleted) projectCreated = false;
  room = await liveblocksApi(`/rooms/${projectId}`);
  check("project deletion removes Liveblocks room", room.status === 404, `status=${room.status}`);
} catch (error) {
  check("smoke runner completed", false, error instanceof Error ? error.message : String(error));
} finally {
  if (roomCreated) {
    const deleted = await liveblocksApi(`/rooms/${projectId}`, { method: "DELETE" }).catch(() => ({ status: 0 }));
    check("cleanup: Liveblocks room deleted", deleted.status === 204 || deleted.status === 404, `status=${deleted.status}`);
    const gone = await liveblocksApi(`/rooms/${projectId}`).catch(() => ({ status: 0 }));
    check("cleanup: room gone (404)", gone.status === 404, `status=${gone.status}`);
  }
  if (projectCreated) {
    await deleteProjectDirectly().catch(() => undefined);
    console.log(`fallback cleanup removed known fixture project ${projectId}`);
  }
  await cleanupClerkFixtures({ clerkApi, userIds, orgPrefix });
  await actorManager?.close();
  await browser?.close();
  await checkDatabaseCleanup();
}

const passed = results.filter((result) => result.ok).length;
console.log(`\n=== SPEC 10 SMOKE: ${passed}/${results.length} checks passed ===`);
process.exitCode = passed === results.length ? 0 : 1;

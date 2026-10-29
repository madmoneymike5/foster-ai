import 'server-only';

import { Liveblocks } from "@liveblocks/node";

export const LIVEBLOCKS_REQUEST_TIMEOUT_MS = 8_000;

/**
 * Fixed cursor-color palette. Colors are deliberately distinct on the dark
 * canvas so overlapping cursors stay readable. These are data values carried
 * in Liveblocks user info (rendered as inline cursor colors later), not
 * styling, so they are hex literals rather than CSS tokens.
 */
const CURSOR_COLOR_PALETTE = [
  "#00c8d4",
  "#8b82ff",
  "#34d399",
  "#fbbf24",
  "#ff4d4f",
  "#60a5fa",
  "#f472b6",
  "#a3e635",
  "#22d3ee",
  "#fb923c",
] as const;

/**
 * Deterministically maps a user ID to a consistent cursor color from the
 * fixed palette (FNV-1a 32-bit hash). The same user ID always resolves to
 * the same color across requests, processes, and machines — no stored state.
 *
 * @param userId - The Clerk user ID.
 * @returns A hex color from the palette.
 */
export function getCursorColorForUser(userId: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < userId.length; i++) {
    hash ^= userId.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  const index = (hash >>> 0) % CURSOR_COLOR_PALETTE.length;
  return CURSOR_COLOR_PALETTE[index];
}

function resolveSecretKey(): string {
  const secret = process.env.LIVEBLOCKS_SECRET_KEY;
  if (!secret) {
    throw new Error(
      "LIVEBLOCKS_SECRET_KEY is not set. Add it to .env.local (development) or the deployment environment (production)."
    );
  }
  return secret;
}

// One shared client per server process. Resolved lazily (not at module load)
// so a missing secret key fails the request that needs it with a clear error
// instead of crashing every route that imports this module. Next.js dev
// hot-reloads modules, so cache on globalThis during development.
const globalForLiveblocks = globalThis as typeof globalThis & {
  fosterLiveblocks?: Liveblocks;
};

/**
 * Returns the process-scoped Liveblocks node client.
 *
 * @throws When `LIVEBLOCKS_SECRET_KEY` is not configured.
 */
export function getLiveblocksClient(): Liveblocks {
  if (process.env.NODE_ENV !== "production") {
    const cached = globalForLiveblocks.fosterLiveblocks;
    if (cached) return cached;
  }
  const client = new Liveblocks({ secret: resolveSecretKey() });
  if (process.env.NODE_ENV !== "production") {
    globalForLiveblocks.fosterLiveblocks = client;
  }
  return client;
}

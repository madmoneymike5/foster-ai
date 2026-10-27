import 'server-only';
// Node < 26.8.2 has no globalThis.Temporal; the timestamptz codecs need one at
// query time (RUNTIME.TEMPORAL_UNAVAILABLE). Load the polyfill globally before
// anything else touches the runtime.
import 'temporal-polyfill/full/global';
import postgres from '@prisma/orm-postgres/runtime';
import { contractFromJson } from '@prisma/orm-postgres/static';
import type { Contract } from '../prisma/contract.d';
import contractJson from '../prisma/contract.json' with { type: 'json' };

export const contract = contractFromJson<Contract>(contractJson);

/**
 * Resolve and validate the configured PostgreSQL connection URL without ever
 * echoing it (the URL embeds credentials).
 */
function resolveDatabaseUrl(): string {
  const url = process.env['DATABASE_URL'];
  if (!url) {
    throw new Error('DATABASE_URL is not set. Configure it in .env.local (development) or the deployment platform (production).');
  }
  let protocol: string;
  try {
    protocol = new URL(url).protocol;
  } catch {
    throw new Error('DATABASE_URL is not a valid URL. A compatible PostgreSQL connection string (postgres:// or postgresql://) is required.');
  }
  if (protocol !== 'postgres:' && protocol !== 'postgresql:') {
    // Do not reinterpret exotic schemes (prisma+postgres://, sqlite://, ...).
    throw new Error(`DATABASE_URL uses unsupported protocol "${protocol}". A compatible PostgreSQL connection string (postgres:// or postgresql://) is required.`);
  }
  return url;
}

function createDb() {
  return postgres({
    contract,
    url: resolveDatabaseUrl(),
  });
}

type PrismaDb = ReturnType<typeof createDb>;

// One shared pool per server process. Next.js dev hot-reloads modules, so cache
// the instance on globalThis to avoid opening a fresh pool per reload.
const globalForPrisma = globalThis as typeof globalThis & {
  fosterPrismaDb?: PrismaDb;
};

export const db: PrismaDb =
  globalForPrisma.fosterPrismaDb ?? (globalForPrisma.fosterPrismaDb = createDb());

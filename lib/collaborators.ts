import 'server-only';

import { clerkClient } from "@clerk/nextjs/server";

import { db } from "./prisma";

/**
 * A collaborator as the share dialog consumes it. The email is the canonical
 * key (collaborators are stored by email — there is no local user table);
 * `displayName` and `avatarUrl` are enrichment from the Clerk user that
 * matches the email. When no Clerk user matches, `displayName` is the email
 * itself and `avatarUrl` is `null` (the UI falls back to showing the email).
 */
export interface Collaborator {
  email: string;
  displayName: string;
  avatarUrl: string | null;
}

/** RFC 5321 maximum mailbox length; longer values are rejected at the boundary. */
const MAX_EMAIL_LENGTH = 320;

/** Minimal mailbox shape check for boundary validation — not a full RFC parse. */
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Normalizes and validates an email at an API boundary: trims and lowercases,
 * then checks length and a minimal address shape.
 *
 * @param value - Raw email from a request body.
 * @returns The normalized email, or `null` when the value is not a plausible address.
 */
export function normalizeEmail(value: string): string | null {
  const email = value.trim().toLowerCase();
  if (email.length === 0 || email.length > MAX_EMAIL_LENGTH) return null;
  if (!EMAIL_PATTERN.test(email)) return null;
  return email;
}

/**
 * Lists a project's collaborators in grant order, each enriched with the
 * Clerk display name and avatar for its email.
 *
 * Clerk enrichment is best-effort: an unmatched email, or any Clerk Backend
 * API failure, degrades that entry to email-only display — the database list
 * is always returned intact.
 *
 * @param projectId - The project whose collaborators are listed.
 */
export async function listCollaborators(projectId: string): Promise<Collaborator[]> {
  const rows = await db.orm.public.ProjectCollaborator.where((w) => w.projectId.eq(projectId))
    .orderBy((o) => o.createdAt.asc())
    .all();

  const clerkUsers = await lookupClerkUsers(rows.map((row) => row.email));
  return rows.map((row) => {
    const clerk = clerkUsers.get(row.email.toLowerCase());
    return {
      email: row.email,
      displayName: clerk?.name || row.email,
      avatarUrl: clerk?.imageUrl || null,
    };
  });
}

/** A Clerk user's share-dialog-relevant fields. */
interface ClerkUserSummary {
  name: string;
  imageUrl: string;
}

/**
 * Looks up Clerk users for a batch of emails in a single Backend API call
 * (the email filter accepts at most 100 addresses, matching the `limit`).
 * Returns a map keyed by lowercased email; emails without a matching Clerk
 * user are simply absent from the map.
 *
 * @param emails - Collaborator emails to enrich.
 */
async function lookupClerkUsers(emails: string[]): Promise<Map<string, ClerkUserSummary>> {
  const found = new Map<string, ClerkUserSummary>();
  if (emails.length === 0) return found;

  let client: Awaited<ReturnType<typeof clerkClient>>;
  try {
    client = await clerkClient();
  } catch {
    // BAPI unavailability must never break the collaborator list — every
    // entry degrades to email-only display instead.
    return found;
  }

  const batchSize = 100;
  for (let start = 0; start < emails.length; start += batchSize) {
    try {
      const { data } = await client.users.getUserList({
        emailAddress: emails.slice(start, start + batchSize),
        limit: batchSize,
      });
      for (const user of data) {
        for (const address of user.emailAddresses) {
          found.set(address.emailAddress.toLowerCase(), {
            name: user.fullName || user.username || "",
            imageUrl: user.imageUrl,
          });
        }
      }
    } catch {
      // A failed batch degrades only its entries; later batches still enrich.
    }
  }

  return found;
}

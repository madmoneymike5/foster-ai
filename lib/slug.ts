/**
 * Convert an arbitrary project name into a URL-safe slug.
 *
 * Lowercases the input, collapses runs of non-letter/non-number characters
 * into a single dash, and strips leading/trailing dashes so empty input yields "".
 *
 * @param name - Free-form project name.
 * @returns The slug, or "" when the name has no alphanumeric content.
 */
export function slugify(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "");
}

/** Maximum length for a project ID, enforced at the API boundary. */
const MAX_PROJECT_ID_LENGTH = 100;

const PROJECT_ID_PATTERN = /^[\p{L}\p{N}]+(?:-[\p{L}\p{N}]+)*$/u;

/**
 * Generate a short random suffix (base36) used to make a project ID unique.
 *
 * @param length - Number of characters (default 5).
 * @returns A lowercase alphanumeric string of exactly `length` characters.
 */
export function shortIdSuffix(length = 5): string {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => (byte % 36).toString(36)).join("");
}

/**
 * Build the app-level project ID from a project name and a uniqueness suffix:
 * `{slug}-{suffix}` (the slug is dropped when the name has no letter or digit
 * content). This value is the database ID, the /editor/[roomId] URL segment,
 * and the Liveblocks room ID — the three must always agree.
 *
 * @param name - Free-form project name.
 * @param suffix - Uniqueness suffix; a fresh one is generated when omitted.
 * @returns The project/room ID.
 */
export function generateProjectId(name: string, suffix?: string): string {
  const slug = slugify(name);
  const idSuffix = suffix ?? shortIdSuffix();
  const maxSlugLength = Math.max(0, MAX_PROJECT_ID_LENGTH - idSuffix.length - 1);
  const truncatedSlug = slug
    .slice(0, maxSlugLength)
    .replace(/[\uD800-\uDBFF]$/u, "")
    .replace(/-+$/g, "");
  return truncatedSlug ? `${truncatedSlug}-${idSuffix}` : idSuffix;
}

/**
 * Validate a project ID at a system boundary (API path/body) before trusting
 * it: dash-separated letter/digit segments, no leading/trailing or doubled
 * dashes, bounded length.
 *
 * @param value - Candidate project ID.
 * @returns True when the value is a well-formed project ID.
 */
export function isProjectId(value: string): boolean {
  return value.length > 0 && value.length <= MAX_PROJECT_ID_LENGTH && PROJECT_ID_PATTERN.test(value);
}

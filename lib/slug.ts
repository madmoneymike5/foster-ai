/**
 * Convert an arbitrary project name into a URL-safe slug.
 *
 * Lowercases the input, collapses runs of non-alphanumeric characters into a
 * single dash, and strips leading/trailing dashes so empty input yields "".
 *
 * @param name - Free-form project name.
 * @returns The slug, or "" when the name has no alphanumeric content.
 */
export function slugify(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

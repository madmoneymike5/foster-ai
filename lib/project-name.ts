/** Maximum number of Unicode code points allowed in a project name. */
const MAX_PROJECT_NAME_LENGTH = 200;

/**
 * Trim and validate a user-provided project name at the API boundary.
 *
 * @param name - Raw project name supplied by a request.
 * @returns The trimmed name, or `null` when it is blank or too long.
 */
export function normalizeProjectName(name: string): string | null {
  const normalized = name.trim();
  return normalized && Array.from(normalized).length <= MAX_PROJECT_NAME_LENGTH ? normalized : null;
}

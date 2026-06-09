/**
 * Compute the next project name from a raw edited value.
 * Returns the cleaned name, or null when the edit is a no-op
 * (empty after trimming, or unchanged from the current name).
 */
export function nextProjectName(current: string, raw: string): string | null {
  const next = raw.trim().slice(0, 100);
  if (!next) return null;
  if (next === current.trim()) return null;
  return next;
}

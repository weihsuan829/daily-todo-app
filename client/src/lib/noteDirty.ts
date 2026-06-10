/**
 * Whether the editor's current title/content differ from the saved note.
 * Saved `content` of null is treated as an empty string (the editor's empty state).
 * Color/tags/pin/project are saved instantly on change, so they are not considered here.
 */
export function isNoteDirty(
  title: string,
  content: string,
  note: { title: string; content: string | null }
): boolean {
  return title !== note.title || content !== (note.content ?? "");
}

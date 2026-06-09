/** Convert note HTML content to searchable/preview plain text. */
export function htmlToPlainText(html: string | null | undefined): string {
  if (!html) return "";
  return html
    .replace(/<img[^>]*>/gi, " ")   // drop images (no src/alt noise)
    .replace(/<[^>]+>/g, " ")        // strip all remaining tags -> spaces
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/\s+/g, " ")
    .trim();
}

export function noteMatchesQuery(
  note: { title: string; content: string | null | undefined },
  query: string
): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const hay = (note.title + " " + htmlToPlainText(note.content)).toLowerCase();
  return hay.includes(q);
}

export function parseTags(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

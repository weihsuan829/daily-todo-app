/**
 * Week window for task queries: [start, end) where start is midnight of the
 * given day and end is exactly 7 days later.
 */
export function weekWindow(date: Date): { start: Date; end: Date } {
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 7);
  return { start, end };
}

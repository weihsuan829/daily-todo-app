/** Month/day of a date as MM/DD, zero-padded. */
export function formatMonthDay(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${month}/${day}`;
}

/**
 * Label for the 7-day week starting at `weekStart`, e.g. "07/27 - 08/02".
 * The input date is not mutated.
 */
export function weekRangeLabel(weekStart: Date): string {
  const end = new Date(weekStart);
  end.setDate(end.getDate() + 6);
  return `${formatMonthDay(weekStart)} - ${formatMonthDay(end)}`;
}

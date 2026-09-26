/**
 * Calendar arithmetic on YYYY-MM-DD dates, held in UTC so a local DST shift
 * cannot drop or repeat a day. The one copy — every service reads dates through
 * these rather than re-deriving them.
 */

/** Shift a date by whole days. */
export function shiftDate(date: string, delta: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}

/**
 * Whole days from `earlier` to `later`: signed, and exclusive of `earlier`, so
 * the same date is 0. `NaN` when either is not a date — callers decide whether
 * that is an error or a zero.
 */
export function daysBetween(earlier: string, later: string): number {
  const a = Date.parse(`${earlier}T00:00:00Z`);
  const b = Date.parse(`${later}T00:00:00Z`);
  return Math.round((b - a) / 86_400_000);
}

/** The Monday on or before `date` — weeks run Monday to Sunday. */
export function mondayOf(date: string): string {
  // getUTCDay is 0 on Sunday, which is the last day of the week here.
  const offset = (new Date(`${date}T00:00:00Z`).getUTCDay() + 6) % 7;
  return shiftDate(date, -offset);
}

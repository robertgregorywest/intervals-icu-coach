import { daysBetween } from "./dates.js";

/** A date range that has passed the guard: real, ordered, within its cap. */
export interface DateRange {
  oldest: string;
  newest: string;
  /** Days spanned, counting both ends. */
  days: number;
}

export interface DateRangeLimits {
  /** Longest range accepted, in days counting both ends. Owned by the caller. */
  maxDays?: number;
  /** Why the cap exists, appended to the refusal so it teaches the rule. */
  why?: string;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * The one guard every date range passes before anything is fetched. Days are
 * counted inclusively — `2026-09-01..2026-09-28` is 28 days — so every lens
 * over a range agrees on its length, and a cap reads the way a calendar does.
 * A range past its cap is refused rather than truncated.
 */
export function dateRange(
  oldest: string,
  newest: string,
  {
    maxDays = Infinity,
    why = "Narrow the range and try again.",
  }: DateRangeLimits = {}
): DateRange {
  const days = daysBetween(oldest, newest) + 1;
  if (!ISO_DATE.test(oldest) || !ISO_DATE.test(newest) || Number.isNaN(days)) {
    throw new Error(`Dates must be YYYY-MM-DD; got "${oldest}".."${newest}".`);
  }
  if (days < 1) {
    throw new Error(
      `Range ${oldest}..${newest} ends before it starts. ` +
        "Supply oldest then newest."
    );
  }
  if (days > maxDays) {
    throw new Error(
      `Range ${oldest}..${newest} spans ${days} days, over the ` +
        `${maxDays}-day maximum. ${why}`
    );
  }
  return { oldest, newest, days };
}

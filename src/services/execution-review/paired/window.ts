import { daysBetween } from "../../../dates.js";
import type { ReviewWindow } from "./types.js";

/**
 * Longest **Review window**, in days counting both ends. Matches the 3–4 week
 * block cadence the coaching philosophy works in: a longer window stops
 * describing one block, and costs a stream fetch per paired session.
 */
export const MAX_WINDOW_DAYS = 28;

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * The one guard every window passes before anything is fetched. Days are
 * counted inclusively — `2026-09-01..2026-09-28` is 28 days — so every lens
 * over the window agrees on its length.
 */
export function reviewWindow(oldest: string, newest: string): ReviewWindow {
  const days = daysBetween(oldest, newest) + 1;
  if (!ISO_DATE.test(oldest) || !ISO_DATE.test(newest) || Number.isNaN(days)) {
    throw new Error(
      `Window dates must be YYYY-MM-DD; got "${oldest}".."${newest}".`
    );
  }
  if (days < 1) {
    throw new Error(
      `Window ${oldest}..${newest} ends before it starts. ` +
        "Supply oldest then newest."
    );
  }
  if (days > MAX_WINDOW_DAYS) {
    throw new Error(
      `Window ${oldest}..${newest} spans ${days} days, over the ` +
        `${MAX_WINDOW_DAYS}-day maximum. Narrow it — a longer window stops ` +
        "describing one block."
    );
  }
  return { oldest, newest, days };
}

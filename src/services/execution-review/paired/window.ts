import { dateRange } from "../../../shared/date-range.js";
import type { ReviewWindow } from "./types.js";

/**
 * Longest **Review window**, in days counting both ends. Matches the 3–4 week
 * block cadence the coaching philosophy works in: a longer window stops
 * describing one block, and costs a stream fetch per paired session.
 */
export const MAX_WINDOW_DAYS = 28;

/** The one guard every window passes before anything is fetched. */
export function reviewWindow(oldest: string, newest: string): ReviewWindow {
  return dateRange(oldest, newest, {
    maxDays: MAX_WINDOW_DAYS,
    why: "Narrow it — a longer window stops describing one block.",
  });
}

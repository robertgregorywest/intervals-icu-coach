/**
 * Round at the service boundary.
 *
 * Not cosmetic. Lap times are exported to two decimals, so summing seven of
 * them yields `112.21000000000001` and differencing two yields
 * `0.3500000000000014`. A coach reading that has to decide, every time, whether
 * the trailing digits mean anything — and here they never do: the input carries
 * two decimals, so no derived time is meaningful past them.
 *
 * Precision is set per quantity by what the measurement supports:
 * times to the export's own centisecond, speeds and cadences to three
 * significant decimals, and the decline to five so it survives being read as a
 * percentage.
 */

export function round(value: number, dp: number): number;
export function round(
  value: number | undefined,
  dp: number
): number | undefined;
export function round(
  value: number | undefined,
  dp: number
): number | undefined {
  if (value === undefined) return undefined;
  const f = 10 ** dp;
  // `+ Number.EPSILON * value` nudges a value already sitting a float-ulp below
  // its own two-decimal representation back onto it, so 16.869999999 rounds to
  // 16.87 rather than 16.86.
  return Math.round((value + Number.EPSILON * Math.abs(value)) * f) / f;
}

/** Times, in seconds. The export's own precision. */
export const SECONDS_DP = 2;
/** Speeds (m/s), cadences (rpm), development (m). */
export const RATE_DP = 3;
/** Ratios, kept fine enough to read as a percentage to two decimals. */
export const RATIO_DP = 5;

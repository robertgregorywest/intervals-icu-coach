/**
 * Decimal places for track quantities, set by what each measurement supports:
 * times to the export's own centisecond, speeds and cadences to three
 * significant decimals, and the decline to five so it survives being read as a
 * percentage. Applied with the shared `round`.
 */

/** Times, in seconds. The export's own precision. */
export const SECONDS_DP = 2;
/** Speeds (m/s), cadences (rpm), development (m). */
export const RATE_DP = 3;
/** Ratios, kept fine enough to read as a percentage to two decimals. */
export const RATIO_DP = 5;

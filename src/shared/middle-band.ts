/**
 * The coaching philosophy's **middle band**: 76–106% of FTP. Shared because the
 * band lens judges a session's time in it and the training-load week summary
 * and trend total a period's, and the two must count a ride the same way.
 */

/** The band's edges, as a percentage of FTP. */
export const MIDDLE_BAND_LOW_PCT_FTP = 76;
export const MIDDLE_BAND_HIGH_PCT_FTP = 106;

export interface MiddleBandBounds {
  lowW: number;
  highW: number;
}

/** The middle band's absolute bounds for an athlete's FTP. */
export function middleBandBounds(ftp: number): MiddleBandBounds {
  return {
    lowW: Math.round((ftp * MIDDLE_BAND_LOW_PCT_FTP) / 100),
    highW: Math.round((ftp * MIDDLE_BAND_HIGH_PCT_FTP) / 100),
  };
}

/** Whether a wattage sits in the band, edges included. */
export function inMiddleBand(watts: number, bounds: MiddleBandBounds): boolean {
  return watts >= bounds.lowW && watts <= bounds.highW;
}

/**
 * Seconds of a 1 Hz power stream in the band, and seconds with power at all.
 *
 * Each finite sample counts as one second. The stream runs over *recording*
 * time, with pauses simply absent, so a pause is never credited to the band.
 */
export function middleBandSeconds(
  watts: readonly (number | null | undefined)[],
  bounds: MiddleBandBounds
): { bandSeconds: number; powerSeconds: number } {
  let bandSeconds = 0;
  let powerSeconds = 0;
  for (const sample of watts) {
    if (typeof sample !== "number" || !Number.isFinite(sample)) continue;
    powerSeconds += 1;
    if (inMiddleBand(sample, bounds)) bandSeconds += 1;
  }
  return { bandSeconds, powerSeconds };
}

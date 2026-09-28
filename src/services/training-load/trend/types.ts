import type { SportType } from "../../../types.js";

export interface MiddleBandTrendOptions {
  /** Any date in the first week; snapped back to its Monday. */
  oldest: string;
  /** Any date in the last week; snapped forward to its Sunday. */
  newest: string;
  /** Only activities of this type; every type when omitted, as the week summary does. */
  sport?: SportType;
}

/** One period's delivered middle-band time; zeros, not a missing row, when nothing contributed. */
export interface MiddleBandFigures {
  seconds: number;
  hours: number;
  /** Fraction of the power-recorded riding time in the band; null with none. */
  fractionOfPowerTime: number | null;
  /** Min and max of the per-ride FTPs that contributed; null when none did. */
  ftpRange: { min: number; max: number } | null;
  /** Present when the period spans an FTP change. */
  note?: string;
  /** Power-recorded rides with no FTP from any source, left out of the figures. */
  excludedNoFtp: number;
  /** Rides that contributed: recorded power, an FTP and a power stream. */
  rides: number;
}

export interface MiddleBandTrendWeek extends MiddleBandFigures {
  /** Monday. */
  weekStart: string;
  /** Sunday. */
  weekEnd: string;
}

export interface MiddleBandTrendResult {
  /** The Monday the first week starts on. */
  oldest: string;
  /** The Sunday the last week ends on. */
  newest: string;
  sport: SportType | null;
  /** The band, stated once: every ride is bucketed against its own FTP. */
  band: { lowPctFtp: number; highPctFtp: number };
  weeks: MiddleBandTrendWeek[];
  total: MiddleBandFigures;
}

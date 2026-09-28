import type { Activity, IActivitiesApi } from "../activities/index.js";
import type { IAthleteAnchors } from "../athlete-anchors/index.js";
import {
  MIDDLE_BAND_HIGH_PCT_FTP,
  MIDDLE_BAND_LOW_PCT_FTP,
  bucketDelivered,
  middleBandBounds,
} from "../execution-review/index.js";

export { MIDDLE_BAND_HIGH_PCT_FTP, MIDDLE_BAND_LOW_PCT_FTP };

/** One activity's delivered middle-band time, measured against its own FTP. */
export interface RideBand {
  seconds: number | null;
  powerSeconds: number;
  ftp: number | null;
  lowW: number | null;
  highW: number | null;
  /** Recorded power but no FTP from any source. */
  noFtp: boolean;
}

/** The middle-band figures of a set of rides, before a caller shapes them. */
export interface BandRollUp {
  ftpRange: { min: number; max: number };
  /** Present when the rides span an FTP change. */
  note?: string;
  excludedNoFtp: number;
  /** Rides that contributed: recorded power, an FTP and a power stream. */
  rides: number;
  seconds: number;
  hours: number;
  fractionOfPowerTime: number | null;
}

const NO_BAND: RideBand = {
  seconds: null,
  powerSeconds: 0,
  ftp: null,
  lowW: null,
  highW: null,
  noFtp: false,
};

/**
 * One stream fetch per power-recorded activity, each bucketed against its own
 * FTP (the ride's icu_ftp, else the athlete's). The one measurement behind the
 * week summary and the trend, so the two agree for any week.
 */
export async function measureRides(
  activities: Activity[],
  activitiesApi: IActivitiesApi,
  anchors: IAthleteAnchors | undefined
): Promise<RideBand[]> {
  return Promise.all(
    activities.map(async (a): Promise<RideBand> => {
      if (!numericField(a, "icu_average_watts")) return { ...NO_BAND };
      const ftp = (await anchors?.planFtp(null, a)) ?? null;
      if (!ftp) return { ...NO_BAND, noFtp: true };
      const streams = await activitiesApi.getActivityStreams(a.id, ["watts"]);
      if (!streams.watts?.length) return { ...NO_BAND };
      const bounds = middleBandBounds(ftp);
      const bucketed = bucketDelivered(streams.watts, [], bounds);
      return {
        seconds: bucketed.middleBandSeconds,
        powerSeconds: bucketed.totalSeconds,
        ftp,
        lowW: bounds.lowW,
        highW: bounds.highW,
        noFtp: false,
      };
    })
  );
}

/**
 * Sums measured rides. Null when none contributed; `span` names the period in
 * the FTP-change note ("week", "range").
 */
export function rollUpBand(rides: RideBand[], span: string): BandRollUp | null {
  const measured = rides.filter((r) => r.ftp !== null);
  const excludedNoFtp = rides.filter((r) => r.noFtp).length;
  if (!measured.length) return null;

  const bandSeconds = sum(measured.map((r) => r.seconds ?? 0));
  const powerSeconds = sum(measured.map((r) => r.powerSeconds));
  const ftps = measured.map((r) => r.ftp as number);
  const ftpRange = { min: Math.min(...ftps), max: Math.max(...ftps) };
  return {
    ftpRange,
    ...(ftpRange.min !== ftpRange.max
      ? {
          note:
            `The ${span} spans an FTP change (${ftpRange.min}-${ftpRange.max} W); ` +
            "each ride was measured against its own FTP.",
        }
      : {}),
    excludedNoFtp,
    rides: measured.length,
    seconds: bandSeconds,
    hours: round1(bandSeconds / 3600),
    fractionOfPowerTime: powerSeconds
      ? Math.round((bandSeconds / powerSeconds) * 1000) / 1000
      : null,
  };
}

function sum(values: number[]): number {
  return values.reduce((total, v) => total + v, 0);
}

function numericField(obj: Record<string, unknown>, key: string): number {
  const v = obj[key];
  return typeof v === "number" ? v : 0;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

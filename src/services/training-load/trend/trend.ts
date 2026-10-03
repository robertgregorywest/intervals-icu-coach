import { mondayOf, shiftDate } from "../../../shared/dates.js";
import { dateRange } from "../../../shared/date-range.js";
import type { Activity, IActivitiesApi } from "../../activities/index.js";
import type { IAthleteAnchors } from "../../athlete-anchors/index.js";
import {
  MIDDLE_BAND_HIGH_PCT_FTP,
  MIDDLE_BAND_LOW_PCT_FTP,
} from "../../../shared/middle-band.js";
import { measureRides, rollUpBand } from "../middle-band.js";
import type { RideBand } from "../middle-band.js";
import type {
  MiddleBandFigures,
  MiddleBandTrendOptions,
  MiddleBandTrendResult,
} from "./types.js";

/**
 * The trend fetches one power stream per power-recorded ride, so its range is
 * capped: a block and its lead-in, not a season.
 */
export const MAX_TREND_WEEKS = 16;

export interface MiddleBandTrendDeps {
  activitiesApi: IActivitiesApi;
  anchors?: IAthleteAnchors;
}

export class MiddleBandTrend {
  constructor(private deps: MiddleBandTrendDeps) {}

  async getMiddleBandTrend(
    options: MiddleBandTrendOptions
  ): Promise<MiddleBandTrendResult> {
    const { weekStarts, oldest, newest } = snapToWeeks(
      options.oldest,
      options.newest
    );

    const all = await this.deps.activitiesApi.getActivities(oldest, newest);
    const activities = options.sport
      ? all.filter((a) => a.type === options.sport)
      : all;
    // One snapshot for the whole range, so the athlete FTP is read once.
    const rides = await measureRides(
      activities,
      this.deps.activitiesApi,
      this.deps.anchors?.snapshot()
    );

    const byWeek = new Map<string, RideBand[]>(weekStarts.map((w) => [w, []]));
    activities.forEach((a, i) => {
      byWeek.get(mondayOf(activityDate(a)))?.push(rides[i]);
    });

    return {
      oldest,
      newest,
      sport: options.sport ?? null,
      band: {
        lowPctFtp: MIDDLE_BAND_LOW_PCT_FTP,
        highPctFtp: MIDDLE_BAND_HIGH_PCT_FTP,
      },
      weeks: weekStarts.map((weekStart) => ({
        weekStart,
        weekEnd: shiftDate(weekStart, 6),
        ...figures(byWeek.get(weekStart) ?? [], "week"),
      })),
      // From the weekly buckets, so the total is always the sum of its rows.
      total: figures([...byWeek.values()].flat(), "range"),
    };
  }
}

/**
 * Snaps the range out to whole Monday-to-Sunday weeks and enforces the cap on
 * the snapped range, since that is what is fetched.
 */
function snapToWeeks(
  from: string,
  to: string
): { weekStarts: string[]; oldest: string; newest: string } {
  dateRange(from, to);
  const { oldest, newest, days } = dateRange(
    mondayOf(from),
    shiftDate(mondayOf(to), 6),
    {
      maxDays: MAX_TREND_WEEKS * 7,
      why:
        `That is more than ${MAX_TREND_WEEKS} weeks once snapped to ` +
        "Monday-to-Sunday weeks, and every power-recorded ride costs a stream " +
        "fetch — narrow the range and try again.",
    }
  );
  const weekStarts = Array.from({ length: days / 7 }, (_, i) =>
    shiftDate(oldest, i * 7)
  );
  return { weekStarts, oldest, newest };
}

function figures(rides: RideBand[], span: string): MiddleBandFigures {
  const rolled = rollUpBand(rides, span);
  if (rolled) return rolled;
  return {
    seconds: 0,
    hours: 0,
    fractionOfPowerTime: null,
    ftpRange: null,
    excludedNoFtp: rides.filter((r) => r.noFtp).length,
    rides: 0,
  };
}

/** The local calendar date an activity started on. */
function activityDate(a: Activity): string {
  return String(a.start_date_local ?? "").slice(0, 10);
}

import { isoToday } from "../../clock.js";
import { mondayOf, shiftDate } from "../../dates.js";
import type { Activity } from "../activities/index.js";
import type { WellnessRecord } from "../wellness/index.js";
import type { IntervalsEvent } from "../../types.js";
import {
  MIDDLE_BAND_HIGH_PCT_FTP,
  MIDDLE_BAND_LOW_PCT_FTP,
  bucketDelivered,
  middleBandBounds,
} from "../execution-review/index.js";
import type {
  ActivitySummary,
  EventSummary,
  FitnessDelta,
  ITrainingWeek,
  SportTotals,
  TrainingWeekDeps,
  TrainingWeekSummary,
  WeekMiddleBand,
} from "./types.js";

export class TrainingWeek implements ITrainingWeek {
  constructor(private deps: TrainingWeekDeps) {}

  async getTrainingWeekSummary(
    weekStart?: string
  ): Promise<TrainingWeekSummary> {
    const start = weekStart ?? mondayOf((this.deps.today ?? isoToday)());
    const end = shiftDate(start, 6);

    const [activities, wellness, events] = await Promise.all([
      this.deps.activitiesApi.getActivities(start, end),
      this.deps.wellnessApi.getWellness(start, end),
      this.deps.eventsApi.getEvents(start, end),
    ]);

    const { perActivity, middleBand } =
      await this.measureMiddleBand(activities);

    return {
      week: { start, end },
      totals: computeTotals(activities),
      middleBand,
      bySport: groupBySport(activities),
      fitness: computeFitnessDelta(wellness),
      completedActivities: activities.map((a, i) => ({
        ...summarizeActivity(a),
        middleBandSeconds: perActivity[i].seconds,
        ftp: perActivity[i].ftp,
        lowW: perActivity[i].lowW,
        highW: perActivity[i].highW,
      })),
      events: events.map(summarizeEvent),
    };
  }

  /** One stream fetch per power-recorded activity, each against its own FTP. */
  private async measureMiddleBand(activities: Activity[]): Promise<{
    perActivity: RideBand[];
    middleBand: WeekMiddleBand | null;
  }> {
    const anchors = this.deps.anchors?.snapshot();
    const perActivity = await Promise.all(
      activities.map(async (a): Promise<RideBand> => {
        if (!numericField(a, "icu_average_watts")) return { ...NO_BAND };
        const ftp = (await anchors?.planFtp(null, a)) ?? null;
        if (!ftp) return { ...NO_BAND, noFtp: true };
        const streams = await this.deps.activitiesApi.getActivityStreams(a.id, [
          "watts",
        ]);
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

    const measured = perActivity.filter((r) => r.ftp !== null);
    const excludedNoFtp = perActivity.filter((r) => r.noFtp).length;
    if (!measured.length) return { perActivity, middleBand: null };

    const bandSeconds = sum(measured.map((r) => r.seconds ?? 0));
    const powerSeconds = sum(measured.map((r) => r.powerSeconds));
    const ftps = measured.map((r) => r.ftp as number);
    const ftpRange = { min: Math.min(...ftps), max: Math.max(...ftps) };
    return {
      perActivity,
      middleBand: {
        lowPctFtp: MIDDLE_BAND_LOW_PCT_FTP,
        highPctFtp: MIDDLE_BAND_HIGH_PCT_FTP,
        ftpRange,
        ...(ftpRange.min !== ftpRange.max
          ? {
              note:
                `The week spans an FTP change (${ftpRange.min}-${ftpRange.max} W); ` +
                "each ride was measured against its own FTP.",
            }
          : {}),
        excludedNoFtp,
        seconds: bandSeconds,
        hours: round1(bandSeconds / 3600),
        fractionOfPowerTime: powerSeconds
          ? Math.round((bandSeconds / powerSeconds) * 1000) / 1000
          : null,
      },
    };
  }
}

interface RideBand {
  seconds: number | null;
  powerSeconds: number;
  ftp: number | null;
  lowW: number | null;
  highW: number | null;
  /** Recorded power but no FTP from any source. */
  noFtp: boolean;
}

const NO_BAND: RideBand = {
  seconds: null,
  powerSeconds: 0,
  ftp: null,
  lowW: null,
  highW: null,
  noFtp: false,
};

function sum(values: number[]): number {
  return values.reduce((total, v) => total + v, 0);
}

export function createTrainingWeek(deps: TrainingWeekDeps): TrainingWeek {
  return new TrainingWeek(deps);
}

function computeTotals(activities: Activity[]) {
  let tss = 0;
  let seconds = 0;
  for (const a of activities) {
    tss += numericField(a, "icu_training_load");
    seconds += numericField(a, "moving_time");
  }
  return {
    activityCount: activities.length,
    tss: round1(tss),
    durationSeconds: seconds,
    durationHours: round1(seconds / 3600),
  };
}

function groupBySport(activities: Activity[]): Record<string, SportTotals> {
  const out: Record<string, SportTotals> = {};
  for (const a of activities) {
    const sport = String(a.type || "Unknown");
    const slot = out[sport] ?? { count: 0, tss: 0, hours: 0 };
    slot.count += 1;
    slot.tss = round1(slot.tss + numericField(a, "icu_training_load"));
    slot.hours = round1(slot.hours + numericField(a, "moving_time") / 3600);
    out[sport] = slot;
  }
  return out;
}

function computeFitnessDelta(wellness: WellnessRecord[]): FitnessDelta | null {
  if (!wellness.length) return null;
  const sorted = [...wellness].sort((a, b) =>
    String(a.id).localeCompare(String(b.id))
  );
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  return {
    startDate: String(first.id),
    endDate: String(last.id),
    ctl: {
      start: round1(first.ctl),
      end: round1(last.ctl),
      delta: round1(last.ctl - first.ctl),
    },
    atl: {
      start: round1(first.atl),
      end: round1(last.atl),
      delta: round1(last.atl - first.atl),
    },
    tsb: {
      start: round1(first.ctl - first.atl),
      end: round1(last.ctl - last.atl),
    },
  };
}

function summarizeActivity(
  a: Activity
): Omit<ActivitySummary, "middleBandSeconds" | "ftp" | "lowW" | "highW"> {
  const seconds = numericField(a, "moving_time");
  const meters = numericField(a, "distance");
  const source = typeof a.source === "string" ? a.source : null;
  return {
    id: a.id,
    date: a.start_date_local,
    type: a.type,
    name: a.name,
    source,
    tss: round1(numericField(a, "icu_training_load")),
    durationMin: Math.round(seconds / 60),
    distanceKm: meters ? round1(meters / 1000) : null,
    avgWatts: numericField(a, "icu_average_watts") || null,
    avgHr: numericField(a, "average_heartrate") || null,
  };
}

function summarizeEvent(e: IntervalsEvent): EventSummary {
  return {
    id: e.id,
    date: e.start_date_local,
    category: e.category,
    type: e.type,
    name: e.name,
  };
}

function numericField(obj: Record<string, unknown>, key: string): number {
  const v = obj[key];
  return typeof v === "number" ? v : 0;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

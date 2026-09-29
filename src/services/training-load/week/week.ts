import { isoToday } from "../../../clock.js";
import { mondayOf, shiftDate } from "../../../dates.js";
import type { Activity } from "../../activities/index.js";
import type { WellnessRecord } from "../../wellness/index.js";
import type { IntervalsEvent } from "../../../types.js";
import {
  MIDDLE_BAND_HIGH_PCT_FTP,
  MIDDLE_BAND_LOW_PCT_FTP,
  measureRides,
  rollUpBand,
} from "../middle-band.js";
import type {
  ActivitySummary,
  EventSummary,
  FitnessDelta,
  SportTotals,
  TrainingWeekDeps,
  TrainingWeekSummary,
  WeekMiddleBand,
} from "./types.js";
import type { RideBand } from "../middle-band.js";
import { round } from "../../../round.js";

export class TrainingWeek {
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

  /** The week's middle band, from the one measurement the trend shares. */
  private async measureMiddleBand(activities: Activity[]): Promise<{
    perActivity: RideBand[];
    middleBand: WeekMiddleBand | null;
  }> {
    const perActivity = await measureRides(
      activities,
      this.deps.activitiesApi,
      this.deps.anchors?.snapshot()
    );
    const rolled = rollUpBand(perActivity, "week");
    if (!rolled) return { perActivity, middleBand: null };
    const { rides: _rides, ...band } = rolled;
    return {
      perActivity,
      middleBand: {
        lowPctFtp: MIDDLE_BAND_LOW_PCT_FTP,
        highPctFtp: MIDDLE_BAND_HIGH_PCT_FTP,
        ...band,
      },
    };
  }
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
    tss: round(tss, 1),
    durationSeconds: seconds,
    durationHours: round(seconds / 3600, 1),
  };
}

function groupBySport(activities: Activity[]): Record<string, SportTotals> {
  const out: Record<string, SportTotals> = {};
  for (const a of activities) {
    const sport = String(a.type || "Unknown");
    const slot = out[sport] ?? { count: 0, tss: 0, hours: 0 };
    slot.count += 1;
    slot.tss = round(slot.tss + numericField(a, "icu_training_load"), 1);
    slot.hours = round(slot.hours + numericField(a, "moving_time") / 3600, 1);
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
      start: round(first.ctl, 1),
      end: round(last.ctl, 1),
      delta: round(last.ctl - first.ctl, 1),
    },
    atl: {
      start: round(first.atl, 1),
      end: round(last.atl, 1),
      delta: round(last.atl - first.atl, 1),
    },
    tsb: {
      start: round(first.ctl - first.atl, 1),
      end: round(last.ctl - last.atl, 1),
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
    tss: round(numericField(a, "icu_training_load"), 1),
    durationMin: Math.round(seconds / 60),
    distanceKm: meters ? round(meters / 1000, 1) : null,
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

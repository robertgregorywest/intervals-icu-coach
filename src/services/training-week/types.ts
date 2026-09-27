import type { IActivitiesApi } from "../activities/index.js";
import type { IEventsApi } from "../events/index.js";
import type { IWellnessApi } from "../wellness/index.js";
import type { IAthleteAnchors } from "../athlete-anchors/index.js";

export interface TrainingWeekDeps {
  activitiesApi: IActivitiesApi;
  wellnessApi: IWellnessApi;
  eventsApi: IEventsApi;
  /**
   * The athlete's FTP, which anchors the middle band. Optional: without it the
   * week summary reports no middle-band figures rather than guessing a frame.
   */
  anchors?: IAthleteAnchors;
  /** "Today" as YYYY-MM-DD; defaults to the system clock (UTC). */
  today?: () => string;
}

export interface SportTotals {
  count: number;
  tss: number;
  hours: number;
}

export interface FitnessDelta {
  startDate: string;
  endDate: string;
  ctl: { start: number; end: number; delta: number };
  atl: { start: number; end: number; delta: number };
  tsb: { start: number; end: number };
}

export interface ActivitySummary {
  id: number | string | null | undefined;
  date: string | null | undefined;
  type: string | null | undefined;
  name: string | null | undefined;
  source: string | null;
  tss: number;
  durationMin: number;
  distanceKm: number | null;
  avgWatts: number | null;
  avgHr: number | null;
  /**
   * Seconds ridden inside the middle band, from the recorded power stream.
   * Null when the activity has no power or the band could not be framed.
   */
  middleBandSeconds: number | null;
}

/** The tempo-through-threshold window, as bounds and the week's delivered time in it. */
export interface WeekMiddleBand {
  lowPctFtp: number;
  highPctFtp: number;
  lowW: number;
  highW: number;
  seconds: number;
  hours: number;
  /** Fraction of the power-recorded riding time spent in the band. */
  fractionOfPowerTime: number | null;
}

export interface EventSummary {
  id: number | string | null | undefined;
  date: string | null | undefined;
  category: string | null | undefined;
  type: string | null | undefined;
  name: string | null | undefined;
}

export interface TrainingWeekSummary {
  week: { start: string; end: string };
  totals: {
    activityCount: number;
    tss: number;
    durationSeconds: number;
    durationHours: number;
  };
  /** Delivered time in the middle band; null when FTP is unavailable. */
  middleBand: WeekMiddleBand | null;
  bySport: Record<string, SportTotals>;
  fitness: FitnessDelta | null;
  completedActivities: ActivitySummary[];
  events: EventSummary[];
}

export interface ITrainingWeek {
  getTrainingWeekSummary(weekStart?: string): Promise<TrainingWeekSummary>;
}

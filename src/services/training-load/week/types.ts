import type { IActivitiesApi } from "../../activities/index.js";
import type { IEventsApi } from "../../events/index.js";
import type { IWellnessApi } from "../../wellness/index.js";
import type { IAthleteAnchors } from "../../athlete-anchors/index.js";

export interface TrainingWeekDeps {
  activitiesApi: IActivitiesApi;
  wellnessApi: IWellnessApi;
  eventsApi: IEventsApi;
  /**
   * Resolves each ride's FTP, which anchors its middle band. Optional: without
   * it the week summary reports no middle-band figures rather than guessing a
   * frame.
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
  /** The FTP this ride was measured against, and its band bounds; null without power or FTP. */
  ftp: number | null;
  lowW: number | null;
  highW: number | null;
}

/** The tempo-through-threshold window, as bounds and the week's delivered time in it. */
export interface WeekMiddleBand {
  lowPctFtp: number;
  highPctFtp: number;
  /** Min and max of the per-ride FTPs of the rides that contributed. */
  ftpRange: { min: number; max: number };
  /** Present when the week spans an FTP change. */
  note?: string;
  /** Power-recorded rides with no FTP from any source, left out of the figures. */
  excludedNoFtp: number;
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

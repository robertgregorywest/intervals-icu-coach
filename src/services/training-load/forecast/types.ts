import type { IntervalsEvent, SportType } from "../../../types.js";
import type { StreamGap } from "./load.js";
import type { TrajectoryDay } from "./trajectory.js";

/** A session the caller wants to see the effect of, before writing it. */
export interface ProposedSession {
  /** YYYY-MM-DD. Replaces whatever is planned on that date. */
  date: string;
  name?: string;
  /** Workout text, parsed locally and costed from its own steps. */
  description?: string;
  /**
   * A load figure supplied directly, for a session whose shape is not yet
   * decided — "assume 180 for the club run". Ignored when `description` is
   * given, because a prescription is better evidence than an assumption.
   */
  load?: number;
  /** Duration for a load-only session, so the weekly hours stay meaningful. */
  durationSeconds?: number;
  /** Defaults to `Ride`. `WeightTraining` contributes no load, as on the platform. */
  type?: SportType;
}

/**
 * Where a session's load came from. Travels per session rather than per
 * forecast: a week mixing a written track night, a drafted weekend and an
 * assumed club run is the normal case.
 */
export type LoadSource =
  | "local-parse"
  | "platform"
  | "caller-supplied"
  | "unmodelled-strength"
  | "underivable";

export interface ForecastSession {
  date: string;
  name?: string;
  type?: string;
  /** Set when the session is an event already on the calendar. */
  eventId?: number;
  /** Whether it came from the calendar or from the caller. */
  origin: "planned" | "proposed";
  load: number;
  durationSeconds?: number;
  source: LoadSource;
  /** Set when the load was derived here. */
  normalizedPower?: number;
  intensityFactor?: number;
  /** Steps that contributed no time to the derivation. */
  gaps?: StreamGap[];
  /** Why a session contributes no load, when it contributes none. */
  note?: string;
}

export interface ForecastWeek {
  /** Monday. */
  weekStart: string;
  weekEnd: string;
  load: number;
  durationSeconds: number;
  /** Fitness across the week — the figure a block plan is judged against. */
  ctlStart: number;
  ctlEnd: number;
  ramp: number;
  /** False when the window covers only part of this week. */
  complete: boolean;
}

export interface ForecastBasis {
  /** The threshold every percentage and zone target was resolved against. */
  ftp: number;
  ftpSource: "caller-supplied" | "athlete-sport-settings";
  powerZones: number[] | null;
  ctlDays: number;
  atlDays: number;
  timeConstantsSource: "athlete-sport-settings" | "platform-defaults";
  /** The last day *before* the window, whose delivered state the model starts from. */
  seedDate: string;
  seedSource: "delivered-wellness" | "caller-supplied";
  seedCtl: number;
  seedAtl: number;
  /** Delivered days read behind the window so ramp is defined from day one. */
  historyDays: number;
}

export interface ForecastResult {
  oldest: string;
  newest: string;
  basis: ForecastBasis;
  days: TrajectoryDay[];
  weeks: ForecastWeek[];
  sessions: ForecastSession[];
  /** Standing caveats — what the model does not model. */
  notes: string[];
}

export interface ForecastOptions {
  /** First forecast day, YYYY-MM-DD. */
  oldest: string;
  /** Last forecast day, YYYY-MM-DD. */
  newest: string;
  /** Sessions to overlay on whatever is already planned, keyed by date. */
  sessions?: ProposedSession[];
  /** Fitness and fatigue to start from, instead of the delivered record. */
  seed?: { ctl: number; atl: number };
  /** Threshold to resolve targets against, instead of the athlete's own. */
  ftp?: number;
}

export type { StreamGap, TrajectoryDay, IntervalsEvent };

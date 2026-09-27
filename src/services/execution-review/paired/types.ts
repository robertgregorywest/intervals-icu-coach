import type { Activity, ActivityStreams } from "../../activities/index.js";
import type { IntervalsEvent } from "../../../types.js";
import type { ExecutionCandidate } from "../steps/delivered.js";

/** A **Review window** that has passed the one guard: real, ordered, one block long. */
export interface ReviewWindow {
  oldest: string;
  newest: string;
  /** Days spanned, counting both ends. */
  days: number;
}

/**
 * One planned event and the ride paired to it, with everything a lens reads
 * about the ride fetched on first ask and never again — so lenses composed over
 * the same session share one set of fetches instead of each making their own.
 */
export interface PairedSession {
  event: IntervalsEvent;
  /**
   * The ride as it was found. From a window or an event this is the list
   * payload, which carries the ride's FTP and totals but not its intervals.
   */
  activity: Activity;
  /** The ride with its detected intervals. */
  detail(): Promise<Activity>;
  /**
   * The ride's candidate **Execution records**, best first: device laps, then
   * Intervals.icu's detected intervals (ADR 0006). Empty when neither exists.
   */
  executionRecord(): Promise<ExecutionCandidate[]>;
  /**
   * The ride's `watts` and `time` streams. Rejects when the fetch fails —
   * whether that is fatal is each lens's call, not the loader's.
   */
  streams(): Promise<ActivityStreams>;
}

export type UnpairedReason = "no-paired-event" | "no-paired-activity";

/** A half-session: a ride paired to no plan, or a plan no ride points back at. */
export interface Unpaired {
  reason: UnpairedReason;
  message: string;
  activity?: Activity;
  event?: IntervalsEvent;
}

/** One session looked up by either half: paired, or the reason it is not. */
export type SessionLookup =
  { session: PairedSession } | ({ session?: undefined } & Unpaired);

/** Every session a **Review window** holds, paired once for every lens. */
export interface LoadedWindow {
  window: ReviewWindow;
  /** Every event dated in the window, of any category. */
  events: IntervalsEvent[];
  /**
   * Every event paired to a ride — those dated in the window, and those dated
   * outside it whose ride falls inside, since the ride is the window's work.
   */
  sessions: PairedSession[];
  /** Rides dated in the window that are paired to no planned event. */
  unpairedRides: Unpaired[];
  /** Workout events dated in the window that no ride points back at. */
  unriddenEvents: Unpaired[];
  /** The session for an event in the window, or why there is none. */
  lookup(eventId: number): SessionLookup;
}

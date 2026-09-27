/**
 * Putting a fitted alignment back onto the activity.
 *
 * The alignment knows one thing the platform cannot: where the line was. Track
 * efforts are ridden with a rolling entry, and from the power stream alone
 * there is no way to see where the wind-up ended and the scored run began, so
 * Intervals.icu's own detection swallows the entry into the effort. The scored
 * run excludes it. Writing that boundary onto the activity is the whole point
 * of this service; everything else here is disclosure of what the write costs.
 */

import type { AlignmentVerdict, Reading } from "../alignment/types.js";

export interface TrackRunWriteOptions {
  activityId: string;
  /** The lap-timer export, as exported. */
  splits: string;
  /** Lap length. Defaults to 250 m. */
  lapDistanceMeters?: number;
  /** Compose everything, write nothing. */
  preview?: boolean;
}

/** One scored run as it was written — or as it would be, in preview. */
export interface WrittenRun {
  /** The run's label in the export, verbatim. */
  run: string;
  /** What the interval carries on the activity. Non-strong fits say so here. */
  label: string;
  verdict: AlignmentVerdict;
  /** Why the verdict is not `strong`, when it is not. */
  reason?: string;

  /** Stream sample indices, end-exclusive — what the platform was sent. */
  startIndex: number;
  endIndex: number;

  /** Where the fit put the run, before snapping. */
  fittedStartSeconds: number;
  fittedEndSeconds: number;
  /**
   * How far each boundary moved to reach a sample, in seconds. Signed: positive
   * means the written boundary sits later than the fitted one.
   */
  startDriftSeconds: number;
  endDriftSeconds: number;

  /** The reading over the fitted window — what `compute_track_lap_power` says. */
  fittedReading: Reading;
  /** The reading over the snapped window — what the activity will show. */
  snappedReading: Reading;
}

export type WriteMode = "written" | "preview";

export interface TrackRunWriteResult {
  activityId: string;
  /** `preview` never touched the activity. */
  mode: WriteMode;
  runs: WrittenRun[];
  /**
   * How many intervals the activity carried before the write. All of them were
   * discarded — they are Intervals.icu's derived analysis, not a record.
   */
  intervalsReplaced: number;
  /**
   * How many intervals the activity carries after the write. Larger than
   * `runs.length`, because the platform fills every uncovered stretch with one
   * of its own. Absent in preview.
   */
  intervalsAfterWrite?: number;
  /** Anything the caller should know that is not attached to one run. */
  notes: string[];
}

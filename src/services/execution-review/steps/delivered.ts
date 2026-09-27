import type { Activity, FitLap } from "../../activities/index.js";
import { toDeliveredIntervals } from "./review.js";
import type { DeliveredInterval, ExecutionRecord } from "./types.js";

/**
 * Below this a lap file records no structure — a single lap is just "the ride".
 * Intervals.icu's detection is the better reading there, and preferring the lap
 * would collapse every session to one step.
 */
export const MIN_LAPS_FOR_STRUCTURE = 2;

/** One candidate reading of what the athlete actually did. */
export interface ExecutionCandidate {
  source: ExecutionRecord;
  intervals: DeliveredInterval[];
  /** Caveat to surface when this candidate is the one reported. */
  note?: string;
}

/**
 * Turn device laps into the comparison's delivered-interval shape.
 *
 * `total_elapsed_time` is used rather than `total_timer_time` so a lap that was
 * paused mid-step still reports the wall-clock time it occupied, matching how
 * the planned step's duration is expressed.
 */
export function lapsToDeliveredIntervals(laps: FitLap[]): DeliveredInterval[] {
  return laps
    .map((lap, index) => ({
      index,
      startTime: lap.startTimeSeconds,
      durationSeconds: lap.durationSeconds,
      averageWatts: lap.averageWatts,
      averageCadence: lap.averageCadence,
      averageHeartrate: lap.averageHeartrate,
    }))
    .filter((iv) => iv.durationSeconds > 0);
}

/**
 * The readings of the session to try, best first.
 *
 * Device laps lead because they are the only faithful record of what the
 * athlete marked: `icu_intervals` is a derived segmentation that Intervals.icu
 * is free to re-detect or an editor to change, and when it diverges it does so
 * by moving rep boundaries — which is precisely what this comparison measures.
 * Detection still earns second place, because an athlete who never pressed lap
 * (or auto-lapped on distance) leaves nothing better to read.
 */
export function executionCandidates(
  activity: Activity,
  laps: FitLap[] | null
): ExecutionCandidate[] {
  const candidates: ExecutionCandidate[] = [];

  if (laps && laps.length >= MIN_LAPS_FOR_STRUCTURE) {
    candidates.push({
      source: "device-laps",
      intervals: lapsToDeliveredIntervals(laps),
    });
  }

  const detected = toDeliveredIntervals(activity.icu_intervals ?? []);
  if (detected.length > 0) {
    candidates.push({
      source: "detected-intervals",
      intervals: detected,
      note: detectedCaveat(activity, detected.length, laps),
    });
  }

  return candidates;
}

/**
 * Say plainly when the derived intervals are known to have drifted from the
 * recorded laps. Both signals ship in the activity payload and cost nothing to
 * check, and a review built on a segmentation that has been re-cut should not
 * read as confidently as one built on the laps themselves.
 */
function detectedCaveat(
  activity: Activity,
  detectedCount: number,
  laps: FitLap[] | null
): string | undefined {
  const reasons: string[] = [];

  if (activity.icu_intervals_edited === true) {
    reasons.push("they have been edited or re-detected since upload");
  }

  const lapCount =
    laps?.length ??
    (typeof activity.icu_lap_count === "number"
      ? activity.icu_lap_count
      : undefined);
  if (
    lapCount !== undefined &&
    lapCount >= MIN_LAPS_FOR_STRUCTURE &&
    lapCount !== detectedCount
  ) {
    reasons.push(
      `the device recorded ${lapCount} lap(s) but ${detectedCount} interval(s) were detected`
    );
  }

  if (reasons.length === 0) return undefined;

  return (
    "Compared against Intervals.icu's detected intervals rather than the " +
    `device's laps, and ${reasons.join(", and ")}. Step boundaries may not be ` +
    "the ones ridden, so per-step power should be read with caution."
  );
}

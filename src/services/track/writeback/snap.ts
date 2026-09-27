/**
 * Fitted seconds to stream sample indices.
 *
 * The alignment places a run at a fractional time; Intervals.icu anchors an
 * interval to a whole sample. Something has to give, and it is the fractional
 * part — but never silently. Every boundary reports how far it moved, so a
 * reader comparing the activity against `compute_track_lap_power` can see where
 * the two disagree instead of finding it later as a puzzle.
 *
 * At run granularity the movement is bounded by half a sampling interval
 * against a run of 100 s or more, so the two readings usually agree to the
 * digit. That is a reason to report the drift cheaply, not to skip it: the case
 * where it bites is a coarse-sampled recording, which is exactly when nobody is
 * watching for it.
 */

export interface SnappedBoundary {
  index: number;
  /** The sample's own time — where the boundary actually ended up. */
  seconds: number;
  /** Signed: positive means the written boundary sits later than the fitted. */
  driftSeconds: number;
}

export interface SnappedRun {
  start: SnappedBoundary;
  end: SnappedBoundary;
}

/**
 * Snap a run's fitted start and end onto the sample grid.
 *
 * `end` is exclusive, matching the platform: an interval covers samples
 * `[start_index, end_index)`, so `end_index` may legitimately be one past the
 * last sample. That virtual position is given the time the final sample would
 * hold until, so a run finishing at the very end of the recording is not pulled
 * backwards by a sample.
 */
export function snapRun(
  times: number[],
  startSeconds: number,
  endSeconds: number,
  samplingIntervalSeconds: number
): SnappedRun {
  const start = snapBoundary(times, startSeconds, samplingIntervalSeconds);
  let end = snapBoundary(times, endSeconds, samplingIntervalSeconds);

  // A run must span at least one sample, however short it is or however coarse
  // the recording: a zero-width interval is not something to write.
  if (end.index <= start.index) {
    const index = Math.min(start.index + 1, times.length);
    end = {
      index,
      seconds: boundaryTime(times, index, samplingIntervalSeconds),
      driftSeconds: round(
        boundaryTime(times, index, samplingIntervalSeconds) - endSeconds,
        3
      ),
    };
  }

  return { start, end };
}

function snapBoundary(
  times: number[],
  target: number,
  samplingIntervalSeconds: number
): SnappedBoundary {
  const index = nearestIndex(times, target, samplingIntervalSeconds);
  const seconds = boundaryTime(times, index, samplingIntervalSeconds);
  return { index, seconds, driftSeconds: round(seconds - target, 3) };
}

/**
 * The time a boundary index stands for, including the one-past-the-end index
 * that an exclusive interval end can take.
 */
export function boundaryTime(
  times: number[],
  index: number,
  samplingIntervalSeconds: number
): number {
  if (times.length === 0) return 0;
  if (index >= times.length) {
    return times[times.length - 1] + samplingIntervalSeconds;
  }
  return times[Math.max(0, index)];
}

/**
 * Index of the sample nearest `target`, allowing the one-past-the-end position
 * so that a boundary at the very end of the recording snaps forward rather than
 * back onto the last sample.
 */
function nearestIndex(
  times: number[],
  target: number,
  samplingIntervalSeconds: number
): number {
  if (times.length === 0) return 0;

  let lo = 0;
  let hi = times.length - 1;
  let atOrBefore = 0;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (times[mid] <= target) {
      atOrBefore = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }

  const after = atOrBefore + 1;
  const beforeGap = Math.abs(target - times[atOrBefore]);
  const afterGap = Math.abs(
    boundaryTime(times, after, samplingIntervalSeconds) - target
  );
  return afterGap < beforeGap ? after : atOrBefore;
}

function round(value: number, places: number): number {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
}

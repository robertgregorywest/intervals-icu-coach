/**
 * Finding the stretches of the activity a run could sit in, and deciding which
 * run sits in which.
 *
 * Both halves exist because of the same failure. Searching the whole activity
 * with development free returns a confident fiction: on the 2026-08-08 session
 * it found a 0.84 rpm residual and a "development" of 10.25 m inside a 133 W
 * stretch of easy riding, because near-constant cadence fits any near-constant
 * speed profile once the scale is free. Constraining the search to stretches the
 * athlete was actually riding hard in is what makes the fitted development mean
 * something. And matching runs one-to-one in order is what stops two runs of the
 * same distance — runs 3 and 4 differ by 0.6 s over 2 km — from both claiming
 * the same window.
 */

import { positiveQuantile } from "./samples.js";
import type { CandidateWindow, RunSplits } from "./types.js";

/**
 * The session's own near-peak cadence, and the fraction of it a window must
 * hold. Taken from the distribution rather than fixed, so a different gear or a
 * different track does not need a new constant.
 */
const PEAK_CADENCE_QUANTILE = 0.99;
const WINDOW_CADENCE_FRACTION = 0.9;

/** Samples either side to smooth over, so single-sample chatter cannot split a window. */
const SMOOTHING_RADIUS = 1;

/** Two stretches closer than this are one window with a dropout in it. */
const MERGE_GAP_SECONDS = 5;

/** A window shorter than this fraction of a run cannot plausibly hold it. */
const MIN_WINDOW_FRACTION = 0.75;

/** How far outside a window the run's start may be searched. */
export const SEARCH_MARGIN_SECONDS = 25;

export class WindowError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WindowError";
  }
}

/**
 * Maximal stretches of sustained high cadence, long enough to hold the shortest
 * run asked of them.
 */
export function detectCandidateWindows(
  times: number[],
  cadence: number[],
  shortestRunSeconds: number
): CandidateWindow[] {
  const peak = positiveQuantile(cadence, PEAK_CADENCE_QUANTILE);
  if (peak === undefined) return [];
  const threshold = peak * WINDOW_CADENCE_FRACTION;

  const smoothed = smooth(cadence, SMOOTHING_RADIUS);
  const stretches: CandidateWindow[] = [];
  let start: number | null = null;

  for (let i = 0; i < smoothed.length; i++) {
    const high = smoothed[i] >= threshold;
    if (high && start === null) {
      start = times[i];
    } else if (!high && start !== null) {
      stretches.push({ startSeconds: start, endSeconds: times[i] });
      start = null;
    }
  }
  if (start !== null) {
    stretches.push({
      startSeconds: start,
      endSeconds: times[times.length - 1] + 1,
    });
  }

  const merged: CandidateWindow[] = [];
  for (const stretch of stretches) {
    const last = merged[merged.length - 1];
    if (last && stretch.startSeconds - last.endSeconds < MERGE_GAP_SECONDS) {
      last.endSeconds = stretch.endSeconds;
    } else {
      merged.push({ ...stretch });
    }
  }

  const minLength = shortestRunSeconds * MIN_WINDOW_FRACTION;
  return merged.filter((w) => w.endSeconds - w.startSeconds >= minLength);
}

/** The offsets a run's start may take within a given window. */
export function searchRange(
  window: CandidateWindow,
  run: RunSplits,
  streamStart: number,
  streamEnd: number
): { low: number; high: number } | null {
  const low = Math.max(
    streamStart,
    window.startSeconds - SEARCH_MARGIN_SECONDS
  );
  const high = Math.min(
    streamEnd - run.durationSeconds,
    window.endSeconds + SEARCH_MARGIN_SECONDS - run.durationSeconds
  );
  return high >= low ? { low, high } : null;
}

export interface Assignment {
  run: RunSplits;
  window: CandidateWindow;
}

/**
 * Assign runs to windows one-to-one and in order, minimising total residual.
 *
 * `cost(runIndex, windowIndex)` returns the run's best residual in that window,
 * or `null` where it cannot be fitted there. Sessions have a handful of each, so
 * the assignment is a small dynamic program over "first i runs into first j
 * windows" — which enforces chronological order by construction and tolerates a
 * session carrying more windows than scored runs.
 */
export function assignRunsToWindows(
  runs: RunSplits[],
  windows: CandidateWindow[],
  cost: (runIndex: number, windowIndex: number) => number | null
): Assignment[] {
  const n = runs.length;
  const m = windows.length;
  if (n === 0) return [];
  if (m < n) {
    throw new WindowError(
      `The activity has ${m} candidate window(s) but the lap-split record has ${n} run(s). ` +
        "Every run needs its own stretch of sustained high cadence to sit in."
    );
  }

  const INFEASIBLE = Number.POSITIVE_INFINITY;
  // best[i][j] — least total residual placing the first i runs in the first j windows.
  const best: number[][] = Array.from({ length: n + 1 }, () =>
    new Array<number>(m + 1).fill(INFEASIBLE)
  );
  const took: boolean[][] = Array.from({ length: n + 1 }, () =>
    new Array<boolean>(m + 1).fill(false)
  );
  for (let j = 0; j <= m; j++) best[0][j] = 0;

  for (let i = 1; i <= n; i++) {
    for (let j = i; j <= m; j++) {
      const skip = best[i][j - 1];
      const here = cost(i - 1, j - 1);
      const take =
        here === null || best[i - 1][j - 1] === INFEASIBLE
          ? INFEASIBLE
          : best[i - 1][j - 1] + here;
      if (take < skip) {
        best[i][j] = take;
        took[i][j] = true;
      } else {
        best[i][j] = skip;
      }
    }
  }

  if (best[n][m] === INFEASIBLE) {
    const unplaceable = runs.find(
      (_, i) => !windows.some((__, j) => cost(i, j) !== null)
    );
    throw new WindowError(
      unplaceable
        ? `Run ${unplaceable.run} (${unplaceable.durationSeconds.toFixed(2)} s) does not fit ` +
            "any candidate window in the activity."
        : "No one-to-one, in-order match of runs to candidate windows exists."
    );
  }

  const assignments: Assignment[] = [];
  let i = n;
  let j = m;
  while (i > 0) {
    if (took[i][j]) {
      assignments.push({ run: runs[i - 1], window: windows[j - 1] });
      i -= 1;
      j -= 1;
    } else {
      j -= 1;
    }
  }
  return assignments.reverse();
}

function smooth(values: number[], radius: number): number[] {
  if (radius <= 0) return values.slice();
  return values.map((_, i) => {
    let sum = 0;
    let count = 0;
    for (let k = i - radius; k <= i + radius; k++) {
      const v = values[k];
      if (v === undefined || !Number.isFinite(v)) continue;
      sum += v;
      count += 1;
    }
    return count ? sum / count : 0;
  });
}

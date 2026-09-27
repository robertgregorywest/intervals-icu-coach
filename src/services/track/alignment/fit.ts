/**
 * Placing a run inside the activity by fitting cadence.
 *
 * The method is the one recorded in `docs/personal/track-context.md` §8: each
 * lap's timed speed implies a cadence, and the offset that best reproduces the
 * recorded cadence is where the run sits. Two details make it work.
 *
 * The residual is taken on *lap-mean* cadence, not on samples. Cadence swings
 * ±2.5 rpm within every lap as the rider works the bankings, which a
 * per-lap-constant model cannot represent; on the 2026-08-08 session, sampling
 * at 0.25 s gave 1.5–2.0 rpm of residual against 0.48–0.89 rpm on lap means.
 * The extra residual was structure the model ignores by design, not information.
 *
 * And rollout is fitted, not supplied. Predicted cadence is linear in
 * `1/rollout`, so the optimal rollout has a closed form at every candidate
 * offset and the search stays one-dimensional. That matters beyond speed. What
 * the fit returns is the ratio of distance ridden to crank revolutions, which is
 * true development only if the rider covered exactly the lap distance assumed —
 * so a figure below the drivetrain's known development is evidence about the
 * line ridden, or about the gear, and a supplied constant would have absorbed it
 * silently. §1 warns against reading a fitted figure as a nominal gear; it is
 * neither, and it is returned in metres per revolution for that reason.
 */

import { windowMean, type TimedStream } from "./samples.js";
import type {
  AlignmentThresholds,
  AlignmentVerdict,
  RunSplits,
} from "./types.js";

/** Resolution of the offset sweep. Finer than the flat objective can resolve. */
export const OFFSET_STEP_SECONDS = 0.02;

/** Residual at or below this is a strong fit; §8's manual fits ran 0.4–0.7 rpm. */
export const STRONG_RESIDUAL_RPM = 1.0;
/** Above this, lap boundaries are not placed well enough for per-lap output. */
export const MARGINAL_RESIDUAL_RPM = 2.0;
/** A rival offset within this ratio of the best makes the fit ambiguous. */
export const AMBIGUOUS_RESIDUAL_RATIO = 1.15;

/** How far outside the offset interval a rival offset must sit to count as distinct. */
const DISTINCT_OFFSET_SECONDS = 2;

/** Offsets within this much of the best residual are "as good as" the best. */
const INTERVAL_TOLERANCE_RPM = 0.05;
const INTERVAL_TOLERANCE_FRACTION = 0.05;

/**
 * An interval covering this much of the searched range means the residual
 * barely moved anywhere in it — the fit placed nothing. Without this, perfectly
 * flat cadence scores a near-zero residual at every offset, finds no rival
 * outside its own interval, and reports itself strong.
 */
const UNINFORMATIVE_INTERVAL_FRACTION = 0.5;

/** Below this many usable laps a fit is not evidence of anything. */
const MIN_FITTED_LAPS = 3;
const MIN_FITTED_LAP_FRACTION = 0.6;

export const THRESHOLDS: AlignmentThresholds = {
  strongResidualRpm: STRONG_RESIDUAL_RPM,
  marginalResidualRpm: MARGINAL_RESIDUAL_RPM,
  ambiguousResidualRatio: AMBIGUOUS_RESIDUAL_RATIO,
  // Set from the documented failure, not from taste: the 3-second stride
  // track-context.md §8 records gives 5.4 samples per 16 s lap, and that is what
  // manufactured the "18.10 → 15.71" split for a run that went 16.36 → 16.24.
  // Whatever is enough, five is not, so the floor sits above it.
  minSamplesPerLap: 8,
};

export interface ResidualAt {
  residualRpm: number;
  rolloutMeters: number;
  lapsFitted: number;
  lapsExcluded: number;
}

export interface RunFit extends ResidualAt {
  offsetSeconds: number;
  offsetIntervalSeconds: [number, number];
  nextBestOffsetSeconds?: number;
  nextBestResidualRpm?: number;
  residualRatio?: number;
  verdict: AlignmentVerdict;
  reason?: string;
}

/**
 * Residual and implied rollout with the run's start at `offset`.
 *
 * Laps whose cadence window carries nothing usable are dropped rather than
 * counted as zero — a dropout must not drag the rollout down. Returns `null`
 * when too few laps survive to say anything.
 */
export function residualAt(
  cadence: TimedStream,
  run: RunSplits,
  offset: number,
  lapDistanceMeters: number
): ResidualAt | null {
  let sumSpeedTimesCadence = 0;
  let sumSpeedSquared = 0;
  const observed: Array<{ speed: number; cadence: number }> = [];

  for (const lap of run.laps) {
    const start = offset + lap.cumulativeTimeSeconds - lap.lapTimeSeconds;
    const end = offset + lap.cumulativeTimeSeconds;
    const mean = windowMean(cadence, start, end);
    if (mean === undefined || !(mean > 0)) continue;
    const speed = lapDistanceMeters / lap.lapTimeSeconds;
    observed.push({ speed, cadence: mean });
    sumSpeedTimesCadence += speed * mean;
    sumSpeedSquared += speed * speed;
  }

  const lapsFitted = observed.length;
  const lapsExcluded = run.laps.length - lapsFitted;
  if (lapsFitted < 2 || sumSpeedSquared <= 0 || sumSpeedTimesCadence <= 0) {
    return null;
  }

  // rpm per (m/s); rollout is the metres one crank revolution covers.
  const slope = sumSpeedTimesCadence / sumSpeedSquared;
  let squaredError = 0;
  for (const point of observed) {
    const error = point.cadence - slope * point.speed;
    squaredError += error * error;
  }

  return {
    residualRpm: Math.sqrt(squaredError / lapsFitted),
    rolloutMeters: 60 / slope,
    lapsFitted,
    lapsExcluded,
  };
}

/**
 * Sweep the offset range and return the best fit with its confidence.
 *
 * The sweep is single-pass at 0.02 s rather than coarse-then-refine: the range
 * is only tens of seconds wide, so the whole curve costs little, and having it
 * in hand is what makes the offset interval and the next-best rival measurable
 * rather than assumed. A coarse first pass would also risk locking onto the
 * wrong basin of a curve this flat.
 */
export function fitRun(
  cadence: TimedStream,
  run: RunSplits,
  range: { low: number; high: number },
  lapDistanceMeters: number
): RunFit | null {
  const offsets: number[] = [];
  const residuals: number[] = [];
  let best: ResidualAt | null = null;
  let bestIndex = -1;

  for (
    let offset = range.low;
    offset <= range.high + 1e-9;
    offset += OFFSET_STEP_SECONDS
  ) {
    const at = residualAt(cadence, run, offset, lapDistanceMeters);
    if (!at) continue;
    offsets.push(offset);
    residuals.push(at.residualRpm);
    if (!best || at.residualRpm < best.residualRpm) {
      best = at;
      bestIndex = offsets.length - 1;
    }
  }

  if (!best || bestIndex < 0) return null;

  const tolerance = Math.max(
    INTERVAL_TOLERANCE_RPM,
    best.residualRpm * INTERVAL_TOLERANCE_FRACTION
  );
  const ceiling = best.residualRpm + tolerance;

  // The interval is the contiguous run of offsets around the best that fit
  // about as well. It is usually far wider than the sweep step, and that width
  // is the honest statement of how precisely the run is placed.
  let low = bestIndex;
  while (low > 0 && residuals[low - 1] <= ceiling) low -= 1;
  let high = bestIndex;
  while (high < residuals.length - 1 && residuals[high + 1] <= ceiling) {
    high += 1;
  }
  const interval: [number, number] = [offsets[low], offsets[high]];

  let nextBestIndex = -1;
  for (let i = 0; i < offsets.length; i++) {
    const clearOfInterval =
      offsets[i] < interval[0] - DISTINCT_OFFSET_SECONDS ||
      offsets[i] > interval[1] + DISTINCT_OFFSET_SECONDS;
    if (!clearOfInterval) continue;
    if (nextBestIndex < 0 || residuals[i] < residuals[nextBestIndex]) {
      nextBestIndex = i;
    }
  }

  const nextBestResidualRpm =
    nextBestIndex >= 0 ? residuals[nextBestIndex] : undefined;
  const residualRatio =
    nextBestResidualRpm === undefined
      ? undefined
      : nextBestResidualRpm / best.residualRpm;

  const searchedSeconds = offsets[offsets.length - 1] - offsets[0];
  const { verdict, reason } = classify(best, run, residualRatio, {
    intervalSeconds: interval[1] - interval[0],
    searchedSeconds,
  });

  return {
    ...best,
    offsetSeconds: offsets[bestIndex],
    offsetIntervalSeconds: interval,
    nextBestOffsetSeconds:
      nextBestIndex >= 0 ? offsets[nextBestIndex] : undefined,
    nextBestResidualRpm,
    residualRatio,
    verdict,
    reason,
  };
}

function classify(
  best: ResidualAt,
  run: RunSplits,
  residualRatio: number | undefined,
  span: { intervalSeconds: number; searchedSeconds: number }
): { verdict: AlignmentVerdict; reason?: string } {
  if (
    span.searchedSeconds > 0 &&
    span.intervalSeconds >=
      span.searchedSeconds * UNINFORMATIVE_INTERVAL_FRACTION
  ) {
    return {
      verdict: "weak",
      reason:
        `The fit is no better at its best offset than across ${span.intervalSeconds.toFixed(1)} s ` +
        `of the ${span.searchedSeconds.toFixed(1)} s searched, so it does not place the run. ` +
        "Recorded cadence that barely varies cannot be matched to lap times, whatever its residual.",
    };
  }

  const minimumLaps = Math.max(
    MIN_FITTED_LAPS,
    Math.ceil(run.laps.length * MIN_FITTED_LAP_FRACTION)
  );
  if (best.lapsFitted < minimumLaps) {
    return {
      verdict: "weak",
      reason:
        `Only ${best.lapsFitted} of ${run.laps.length} laps carried usable cadence; ` +
        `${minimumLaps} are needed to fit an alignment worth trusting.`,
    };
  }

  if (residualRatio !== undefined && residualRatio < AMBIGUOUS_RESIDUAL_RATIO) {
    return {
      verdict: "ambiguous",
      reason:
        `A distinct offset fits nearly as well (${residualRatio.toFixed(2)}× the best ` +
        `residual, under the ${AMBIGUOUS_RESIDUAL_RATIO}× threshold), so which stretch ` +
        "of the activity this run occupies is not settled.",
    };
  }

  if (best.residualRpm <= STRONG_RESIDUAL_RPM) return { verdict: "strong" };

  if (best.residualRpm <= MARGINAL_RESIDUAL_RPM) {
    return {
      verdict: "marginal",
      reason:
        `Residual ${best.residualRpm.toFixed(2)} rpm is above the ${STRONG_RESIDUAL_RPM} rpm ` +
        "a strong fit clears; the run is placed but individual lap boundaries carry doubt.",
    };
  }

  return {
    verdict: "weak",
    reason:
      `Residual ${best.residualRpm.toFixed(2)} rpm exceeds the ${MARGINAL_RESIDUAL_RPM} rpm ` +
      "ceiling; the recorded cadence does not follow the lap times closely enough to place laps.",
  };
}

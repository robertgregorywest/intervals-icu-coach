/**
 * Derive everything a record does not store.
 *
 * All of it comes off the lap times and the lap distance. No anchor, no air
 * density, no CdA — so nothing here goes stale when MAP moves, and every figure
 * a caller reads was computed from the measurement rather than transcribed
 * beside it.
 *
 * The one input beyond the splits is the drivetrain development, and it is
 * needed only for cadence.
 */

import type { RunSplits } from "../alignment/types.js";
import { round } from "../../../round.js";
import { RATE_DP, RATIO_DP, SECONDS_DP } from "./precision.js";
import type {
  DerivedLap,
  DerivedRun,
  PacingSummary,
  RunStart,
  RunSummary,
  SegmentSummary,
  SessionBasis,
} from "./types.js";

/** The widest segment pair that still leaves a lap between them. */
export const MAX_SEGMENT_LAPS = 3;

/**
 * Metres per crank revolution.
 *
 * `(chainring / cog) × rollout`. **Not** `(chainring / cog) × 27"`, which is
 * the nominal "gear inches" convention and runs ~2.9% high against a real
 * 700×23 track tyre — an error that cost a full analysis cycle on 2026-07-30
 * (`docs/personal/track-context.md` §1). Nothing in this module converts to or
 * from inches.
 */
export function developmentFromBasis(
  basis: SessionBasis
): { meters: number; source: "gear" | "supplied" } | undefined {
  if (basis.developmentMeters !== undefined) {
    return { meters: basis.developmentMeters, source: "supplied" };
  }
  if (!basis.gear) return undefined;
  const m = basis.gear.match(/^(\d+)\s*[x×]\s*(\d+)$/i);
  if (!m) return undefined;
  const [chainring, cog] = [Number(m[1]), Number(m[2])];
  if (!cog) return undefined;
  return {
    meters: (chainring / cog) * (basis.rolloutMm / 1000),
    source: "gear",
  };
}

/** A run's start type: its own override, else the session default. */
export function startFor(basis: SessionBasis, run: string): RunStart {
  return basis.runStarts[run] ?? basis.start;
}

/**
 * Laps per segment.
 *
 * The `− 1` is load-bearing: it guarantees the opening and closing segments
 * never overlap and always leave at least one lap between them, so the decline
 * compares distinct ends of the effort rather than two windows sharing laps.
 * Seven flying laps — a 2 km pursuit — give 3, which is the laps 2–4 / 6–8 split
 * the prose already uses.
 */
export function segmentLapsFor(flyingLaps: number, requested?: number): number {
  const widest = Math.min(MAX_SEGMENT_LAPS, Math.floor((flyingLaps - 1) / 2));
  if (requested === undefined) return widest;
  return Math.min(requested, Math.floor((flyingLaps - 1) / 2));
}

/**
 * A segment, with its mean speed kept unrounded alongside the reported one —
 * the decline cubes that ratio, so rounding it first would carry a 3-decimal
 * truncation into the second decimal of a percentage.
 */
function segment(
  laps: DerivedLap[],
  lapDistanceMeters: number
): { summary: SegmentSummary; exactSpeed: number } {
  const timeSeconds = laps.reduce((a, l) => a + l.lapTimeSeconds, 0);
  const exactSpeed = (laps.length * lapDistanceMeters) / timeSeconds;
  return {
    exactSpeed,
    summary: {
      fromLap: laps[0].lap,
      toLap: laps[laps.length - 1].lap,
      timeSeconds: round(timeSeconds, SECONDS_DP),
      meanSpeedMetersPerSecond: round(exactSpeed, RATE_DP),
    },
  };
}

/**
 * What even pacing would have been worth.
 *
 * Aero work over a fixed distance scales with Σv², so the flat-equivalent speed
 * is the RMS of the lap speeds, not their mean — an unevenly ridden effort
 * covers the distance in less time than its mean speed suggests, and the
 * difference is the gain already banked by going out fast.
 */
function pacing(
  laps: DerivedLap[],
  lapDistanceMeters: number,
  distanceMeters: number
): PacingSummary {
  // Speeds are recomputed from the lap times rather than read off the rounded
  // `speedMetersPerSecond`, because squaring and summing seven of them would
  // otherwise carry the rounding into Σv².
  const sumSquaredSpeed = laps.reduce(
    (a, l) => a + (lapDistanceMeters / l.lapTimeSeconds) ** 2,
    0
  );
  const rms = Math.sqrt(sumSquaredSpeed / laps.length);
  const flat = distanceMeters / rms;
  const actual = laps.reduce((a, l) => a + l.lapTimeSeconds, 0);
  return {
    sumSquaredSpeed: round(sumSquaredSpeed, SECONDS_DP),
    rmsSpeedMetersPerSecond: round(rms, RATE_DP),
    flatEquivalentTimeSeconds: round(flat, SECONDS_DP),
    gainSeconds: round(actual - flat, SECONDS_DP),
  };
}

/**
 * Sample standard deviation (n − 1), not population.
 *
 * The laps are a complete enumeration, so population SD is the more defensible
 * statistic in the abstract. Sample SD is used anyway, because it is what the
 * existing records report — `track-context.md` §4's "SD 0.11" for the 12 Jul
 * run 1 is n − 1; population gives 0.10 — and every SD already written into
 * `coaching-log.md` is on that basis. Switching convention during a migration
 * would silently make new output incomparable with the record it replaces,
 * which is a worse error than the one it fixes.
 */
function standardDeviation(values: number[]): number {
  if (values.length < 2) return 0;
  const mean = values.reduce((a, v) => a + v, 0) / values.length;
  const variance =
    values.reduce((a, v) => a + (v - mean) ** 2, 0) / (values.length - 1);
  return Math.sqrt(variance);
}

export function deriveRun(
  basis: SessionBasis,
  splits: RunSplits,
  developmentMeters: number | undefined,
  requestedSegmentLaps?: number
): DerivedRun {
  const start = startFor(basis, splits.run);
  const d = basis.lapDistanceMeters;

  const laps: DerivedLap[] = splits.laps.map((lap, i) => {
    const speed = d / lap.lapTimeSeconds;
    return {
      lap: i + 1,
      lapTimeSeconds: lap.lapTimeSeconds,
      cumulativeTimeSeconds: lap.cumulativeTimeSeconds,
      speedMetersPerSecond: round(speed, RATE_DP),
      cadenceRpm:
        developmentMeters === undefined
          ? undefined
          : round((speed * 60) / developmentMeters, RATE_DP),
      standingStart: i === 0 && start !== "flying",
    };
  });

  // A standing lap is a different measurement — an acceleration, not a held
  // speed — so averaging it in makes two runs incomparable. It is reported in
  // full and excluded from everything below.
  const flying = laps.filter((l) => !l.standingStart);
  const flyingTime = flying.reduce((a, l) => a + l.lapTimeSeconds, 0);
  const flyingDistance = flying.length * d;

  const segLaps = segmentLapsFor(flying.length, requestedSegmentLaps);
  let opening: SegmentSummary | undefined;
  let closing: SegmentSummary | undefined;
  let declineRatio: number | undefined;
  let segmentsWithheld: string | undefined;

  if (flying.length === 0) {
    segmentsWithheld =
      "The run has no flying laps, so there is nothing to split.";
  } else if (segLaps >= 1) {
    const open = segment(flying.slice(0, segLaps), d);
    const close = segment(flying.slice(-segLaps), d);
    opening = open.summary;
    closing = close.summary;
    // Speed cubed is a power ratio over a fixed distance, so this is the
    // proportional power change from the opening to the close and carries no
    // aero constant — only the exponent.
    declineRatio = round(
      (close.exactSpeed / open.exactSpeed) ** 3 - 1,
      RATIO_DP
    );
  } else {
    segmentsWithheld =
      `A flying portion of ${flying.length} lap(s) cannot be split into two segments ` +
      "that do not overlap, so the decline would compare a window against itself.";
  }

  // No flying laps means every aggregate below would divide by zero.
  const hasFlying = flying.length > 0;
  const summary: RunSummary = {
    totalTimeSeconds: round(splits.durationSeconds, SECONDS_DP),
    totalDistanceMeters: splits.distanceMeters,
    flyingLaps: flying.length,
    flyingTimeSeconds: round(flyingTime, SECONDS_DP),
    flyingDistanceMeters: flyingDistance,
    meanLapTimeSeconds: hasFlying
      ? round(flyingTime / flying.length, SECONDS_DP)
      : undefined,
    meanSpeedMetersPerSecond: hasFlying
      ? round(flyingDistance / flyingTime, RATE_DP)
      : undefined,
    lapTimeSdSeconds: hasFlying
      ? round(standardDeviation(flying.map((l) => l.lapTimeSeconds)), RATE_DP)
      : undefined,
    opening,
    closing,
    declineRatio,
    segmentsWithheld,
    flyingWithheld: hasFlying
      ? undefined
      : "The run is a single standing or gate lap with no flying laps, so every flying aggregate is withheld.",
    pacing: hasFlying ? pacing(flying, d, flyingDistance) : undefined,
  };

  return {
    ref: `${basis.id}#${splits.run}`,
    run: splits.run,
    start,
    laps,
    summary,
  };
}

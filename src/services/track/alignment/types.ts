/**
 * A track session is measured twice: a helper's lap timer records what happened
 * (cumulative distance and time per lap, self-verifiable), and the SRM records
 * the power that produced it. Neither file references the other. These types
 * describe the join — and, just as importantly, how well the join fitted.
 */

/** One timed lap as the lap-timer export gives it. */
export interface LapSplit {
  /** Position within the run, 0-based. */
  index: number;
  /** Cumulative distance from the run's scored start. */
  cumulativeDistanceMeters: number;
  /** Cumulative time from the run's scored start. */
  cumulativeTimeSeconds: number;
  /** The lap's own time. */
  lapTimeSeconds: number;
}

/** One scored run — a set of consecutive timed laps. */
export interface RunSplits {
  /** The run's label in the export, kept verbatim so the caller can match it. */
  run: string;
  laps: LapSplit[];
  /** Total scored time — the last lap's cumulative time. */
  durationSeconds: number;
  /** Total scored distance. */
  distanceMeters: number;
}

/** A stretch of the activity the athlete was riding hard enough to hold a run. */
export interface CandidateWindow {
  /** Seconds into the activity, from the stream's own time base. */
  startSeconds: number;
  endSeconds: number;
}

/**
 * A single reading with the band that alignment uncertainty puts around it.
 *
 * `band` is the full spread between the readings this figure takes at the two
 * edges of the fitted offset interval. It is not a statistical error bar: it
 * answers "how much would this number move if the run sat where it plausibly
 * could instead of where it best does".
 */
export interface Reading {
  watts?: number;
  wattsBand?: number;
  cadence?: number;
  cadenceBand?: number;
  heartrate?: number;
  heartrateBand?: number;
}

export type AlignmentVerdict = "strong" | "marginal" | "weak" | "ambiguous";

export interface AlignmentConfidence {
  /** Residual of the cadence fit, rpm. The figure §8's manual method reports. */
  residualRpm: number;
  /**
   * Offsets whose residual sits within tolerance of the best, as seconds into
   * the activity. The objective is flat near its minimum, so this is usually
   * wider than the 0.02 s the search resolves — that width is the honest
   * statement of how precisely the run is placed.
   */
  offsetIntervalSeconds: [number, number];
  /** Best residual at an offset outside the interval and clear of it. */
  nextBestResidualRpm?: number;
  nextBestOffsetSeconds?: number;
  /** `nextBestResidualRpm / residualRpm`. Near 1 means the fit is ambiguous. */
  residualRatio?: number;
  verdict: AlignmentVerdict;
  /** Why the verdict is not `strong`, when it is not. */
  reason?: string;
  lapsFitted: number;
  lapsExcluded: number;
}

export interface AlignedLap {
  index: number;
  /** The lap timer's own figure, not a measured one. */
  lapTimeSeconds: number;
  startSeconds: number;
  endSeconds: number;
  reading: Reading;
}

export interface AlignedRun {
  run: string;
  /** Seconds into the activity where the scored run starts. */
  startOffsetSeconds: number;
  durationSeconds: number;
  distanceMeters: number;
  /**
   * Metres of assumed lap distance per crank revolution, as fitted.
   *
   * This equals the drivetrain's true development only when the rider covered
   * exactly `lapDistanceMeters` per lap. A figure below the known development
   * says the path ridden was longer than the measurement line, or that the gear
   * was not the one assumed — either way it is a measurement worth having, and
   * a supplied constant would have hidden it. Never read it as gear inches;
   * `docs/personal/track-context.md` §1 records what that costs.
   */
  fittedRolloutMeters: number;
  confidence: AlignmentConfidence;
  /** Aggregate over the whole scored run. */
  average: Reading;
  laps?: AlignedLap[];
  /** Present when per-lap readings were withheld, saying why. */
  lapsWithheld?: string;
}

/** The thresholds a verdict was judged against, published with the result. */
export interface AlignmentThresholds {
  strongResidualRpm: number;
  marginalResidualRpm: number;
  ambiguousResidualRatio: number;
  minSamplesPerLap: number;
}

export interface RolloutAgreement {
  minMeters: number;
  maxMeters: number;
  /** Spread as a percentage of the mean. Runs agreeing tightly is evidence. */
  spreadPercent: number;
}

export interface TrackLapAlignmentResult {
  activityId: string;
  lapDistanceMeters: number;
  /** Median gap between stream samples. */
  samplingIntervalSeconds: number;
  runs: AlignedRun[];
  /** Agreement of the fitted rollout across runs; absent below two runs. */
  rolloutAgreement?: RolloutAgreement;
  thresholds: AlignmentThresholds;
  /** Anything the caller should know that is not attached to one run. */
  notes?: string[];
}

export interface TrackLapPowerOptions {
  activityId: string;
  /** The lap-timer export, as exported. */
  splits: string;
  /** Lap length. Defaults to 250 m. */
  lapDistanceMeters?: number;
}

import type { AlignmentVerdict } from "../alignment/types.js";
import type { TimeRange } from "./speed.js";

export type { TimeRange } from "./speed.js";

/**
 * What a **Drivetrain speed** rewrite is computed from. The gear comes from a
 * **Track session record**'s basis, from `gear`/`rolloutMm`, or both — the
 * arguments override the record. A `sessionId` also turns on the comparison
 * against the record's splits.
 */
export interface DrivetrainSpeedInput {
  /** Required unless the record carries one; overrides the record's. */
  activityId?: string | number;
  sessionId?: string;
  /** `chainring x cog`, e.g. `64x16`. Never gear inches. */
  gear?: string;
  /** Defaults to the record's, else 2099. */
  rolloutMm?: number;
  /** Speed is written only inside these; outside, no claim is made. */
  onTrack?: TimeRange[];
  /** Where the rewritten file goes. Defaults to `out/fit/` in the repo. */
  outputPath?: string;
}

/** A spread of per-sample percentage differences. */
export interface PercentSpread {
  median: number;
  p10: number;
  p90: number;
}

/**
 * The replaced wheel-sensor speed against Drivetrain speed, sample by sample.
 * A cross-check, not a reference: the sensor reads high
 * (`docs/personal/track-context.md` §1).
 */
export interface SensorComparison {
  /** Samples where both speeds exist and the rider was pedalling. */
  samplesCompared: number;
  /** `drivetrain ÷ sensor − 1`, percent. */
  speedDifferencePercent: PercentSpread;
  /** Median of sensor speed ÷ cadence — what the sensor says the gear is. */
  sensorImpliedDevelopmentMeters: number;
  sensorDistanceMeters: number;
  drivetrainDistanceMeters: number;
  /** `drivetrain ÷ sensor − 1` over the whole recording, percent. */
  distanceDifferencePercent: number;
}

export interface LapDistanceCheck {
  index: number;
  /** The lap timer's own figure. */
  lapTimeSeconds: number;
  drivetrainDistanceMeters: number;
  /** Against the lap distance, percent. */
  errorPercent: number;
  sensorErrorPercent?: number;
}

export interface RunDistanceCheck {
  run: string;
  verdict: AlignmentVerdict;
  /** The splits' distance for the run — the reference. */
  scoredDistanceMeters: number;
  /** Drivetrain speed integrated over the run's aligned window. */
  drivetrainDistanceMeters: number;
  errorPercent: number;
  sensorDistanceMeters?: number;
  sensorErrorPercent?: number;
  /** The alignment's **Fitted development**, beside the true one. */
  fittedDevelopmentMeters: number;
  laps?: LapDistanceCheck[];
  /** Why per-lap checks are absent: the alignment withheld its laps. */
  lapsWithheld?: string;
}

/**
 * Drivetrain speed judged against the **Lap-split record** — the reference.
 * Each run's window is the one `compute_track_lap_power` places, and the
 * distance it covers is compared to the distance the splits say was ridden.
 */
export interface SplitsComparison {
  sessionId: string;
  lapDistanceMeters: number;
  runs: RunDistanceCheck[];
  /** Over every run together: `Σ drivetrain ÷ Σ scored − 1`, percent. */
  errorPercent: number;
  sensorErrorPercent?: number;
}

export interface DrivetrainSpeedResult {
  activityId: string;
  /** Absolute path of the rewritten FIT file. */
  outputPath: string;
  development: {
    /** True development, metres per crank revolution. */
    meters: number;
    gear?: string;
    rolloutMm?: number;
    source: "gear" | "supplied";
  };
  recording: {
    records: number;
    withSpeed: number;
    missingCadence: number;
    /** Cadence 0 — rolling without torque, or stopped; no speed claimed. */
    zeroCadence: number;
    outsideOnTrack: number;
    pauses: number;
    pausedSeconds: number;
    samplingIntervalSeconds: number;
  };
  totals: {
    distanceMeters: number;
    maxSpeedMetersPerSecond?: number;
  };
  /** Present when the original file carried speed. */
  sensor?: SensorComparison;
  /** Present when a `sessionId` gave splits and the alignment placed them. */
  splits?: SplitsComparison;
  notes?: string[];
}

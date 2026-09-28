import type { Activity, ActivityInterval } from "../../activities/index.js";
import type {
  CadenceRange,
  FlatPlannedStep,
  PowerTarget,
} from "../../prescription/index.js";

export type { CadenceRange, FlatPlannedStep, PowerTarget };

/**
 * How the planned steps were paired to the recorded intervals.
 *
 * - `sequential` — every planned step matched an interval in order, with no gaps
 *   on either side, and the durations corroborate that ordering.
 * - `duration`   — a partial pairing derived from durations and elapsed position;
 *   some steps and/or intervals are unmatched.
 * - `none`       — no pairing was made.
 */
export type AlignmentBasis = "sequential" | "duration" | "none";

/**
 * Which record of the ride the comparison was built from.
 *
 * - `device-laps`        — the laps the head unit wrote, read from the original
 *   upload. The faithful record of what the athlete marked.
 * - `detected-intervals` — Intervals.icu's `icu_intervals` analysis: derived,
 *   editable, and free to re-cut step boundaries. Used only when laps are
 *   unavailable or cannot explain the session.
 */
export type ExecutionRecord = "device-laps" | "detected-intervals";

/**
 * Why a comparison produced no step alignment. Machine-readable so callers can
 * distinguish "we could not align" from "there was nothing to align" — the tool
 * exists to stop silent gap-filling, so every empty result names its cause.
 */
export type ReviewReason =
  | "no-paired-event"
  | "no-paired-activity"
  | "no-structured-steps"
  | "no-intervals"
  | "alignment-failed";

export type StepVerdict =
  "on-target" | "over" | "under" | "not-attempted" | "unmatched";

/**
 * A step's delivered average cadence judged against its planned cadence.
 * Reported beside the power `verdict`, never folded into it.
 */
export type CadenceVerdict = "on-target" | "over" | "under";

/**
 * Which power figure a step's verdict was judged against.
 *
 * - `average-watts`     — the step's target/duration didn't call for normalized
 *   power, or normalized power was never in play.
 * - `normalized-power`  — a band target prescribed longer than 5 minutes,
 *   judged against normalized power because average power over a long,
 *   wide-ranging outdoor step is depressed by coasting in a way normalized
 *   power is not.
 * - `normalized-power-fallback` — the step qualified for `normalized-power` but
 *   it could not be resolved (no usable power stream on the activity, or the
 *   step's window fell outside it), so the verdict fell back to average power.
 */
export type VerdictBasis =
  "average-watts" | "normalized-power" | "normalized-power-fallback";

/** A recorded interval reduced to the fields the comparison uses. */
export interface DeliveredInterval {
  index: number;
  type?: string;
  label?: string;
  startTime?: number;
  durationSeconds: number;
  averageWatts?: number;
  averageCadence?: number;
  averageHeartrate?: number;
}

/** One planned step next to what was delivered for it. */
export interface AlignedStep {
  index: number;
  label?: string;
  repIndex?: number;
  repCount?: number;
  stepInRep?: number;
  planned: {
    durationSeconds?: number;
    target?: PowerTarget;
    cadence?: number;
    cadenceRange?: CadenceRange;
  };
  /** Absent when the step is `unmatched` — never zero-filled or estimated. */
  delivered?: {
    intervalIndex: number;
    durationSeconds: number;
    averageWatts?: number;
    averageCadence?: number;
    averageHeartrate?: number;
    /**
     * Normalized power over this step's window, from the activity's raw power
     * stream. Present whenever the window resolves to at least 30 seconds of
     * recorded samples, regardless of which figure the verdict below uses.
     */
    normalizedWatts?: number;
    /** Fraction of this step's window recorded at zero watts. */
    coastingFraction?: number;
  };
  /** Absent when the step is `unmatched`. */
  deltas?: {
    /** Delivered minus prescribed, seconds. */
    durationSeconds?: number;
    /** Delivered minus prescribed, watts, from whichever figure `verdictBasis` names. Zero when inside a band target. */
    watts?: number;
    /** `watts` as a fraction of the prescribed target. */
    wattsFraction?: number;
    /** Delivered minus prescribed average cadence, rpm. Zero when inside a band target. */
    cadence?: number;
  };
  verdict: StepVerdict;
  /** Which power figure `verdict` and `deltas.watts` were judged against. */
  verdictBasis: VerdictBasis;
  /**
   * Delivered average cadence against the planned cadence. Present only when
   * the step prescribes a cadence, was paired, was attempted, and recorded a
   * cadence. Independent of `verdict`: a rep can be `on-target` on power and
   * `under` on cadence.
   */
  cadenceVerdict?: CadenceVerdict;
  /** Why an `unmatched` step could not be compared. */
  note?: string;
}

/** Recorded work that paired to no planned step. */
export interface UnplannedInterval {
  intervalIndex: number;
  type?: string;
  durationSeconds: number;
  averageWatts?: number;
}

export interface SessionRollup {
  plannedLoad?: number;
  actualLoad?: number;
  plannedDurationSeconds?: number;
  actualDurationSeconds?: number;
  /** Intervals.icu's own compliance figure — not this tool's verdict. */
  platformCompliance?: number;
  unplannedIntervals: UnplannedInterval[];
}

export interface PlannedVsActualResult {
  activityId?: string;
  eventId?: number;
  activityName?: string;
  eventName?: string;
  date?: string;
  /** The tolerance actually applied, echoed back. */
  tolerance: number;
  /** Which record of the ride the step comparison was read from. */
  executionRecord: ExecutionRecord;
  /** Caveat about that record — set when the derived intervals were used and are known to have drifted. */
  executionRecordNote?: string;
  alignmentBasis: AlignmentBasis;
  /** Fraction of planned steps that were matched, 0–1. */
  matchedFraction: number;
  steps: AlignedStep[];
  rollup: SessionRollup;
  /** Present whenever `steps` is empty or alignment degraded. */
  reason?: ReviewReason;
  /** Human-readable expansion of `reason`. */
  message?: string;
}

export type { Activity, ActivityInterval };

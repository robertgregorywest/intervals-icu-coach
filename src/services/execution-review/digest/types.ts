import type {
  AlignmentBasis,
  CadenceVerdict,
  ExecutionRecord,
  PowerTarget,
  ReviewReason,
  StepVerdict,
  VerdictBasis,
} from "../steps/types.js";
import type { ExcludedSession, MiddleBandRollup } from "../bands/types.js";

/**
 * Why a window produced no step-level review. `no-key-session` is the skip the
 * coaching log's watermark respects — it leaves `reviewed-through` alone.
 */
export type DigestStatus = "reviewed" | "skipped";

/**
 * What one work step's delivery means for the session.
 *
 * - `missed`    — under its power by more than noise, under its cadence, or not
 *   attempted.
 * - `exceeded`  — over its power by more than noise, and met its cadence. A
 *   signal the work can progress. Never set on an **Open-ended work step**,
 *   whose target is a floor.
 * - `unjudged`  — the step could not be paired to a delivered interval.
 */
export type StepOutcome = "missed" | "exceeded" | "unjudged";

/**
 * The **Session outcome**: the one-word reading of a key session's work steps,
 * computed so the coaching applies a reporting policy rather than re-reading
 * the steps. See `docs/adr/0015-session-outcome-computed-in-the-digest.md`.
 *
 * - `unverified` — the step lens could not be trusted: no alignment, no work
 *   steps, no work step paired, or rep boundaries known to have drifted. Never
 *   evidence the session was not ridden; the band lens still counts its dose.
 * - `missed`     — every judged work step missed.
 * - `partial`    — some work steps missed.
 * - `exceeded`   — none missed, and at least one exceeded.
 * - `landed`     — every work step met its prescription.
 */
export type SessionOutcome =
  "landed" | "exceeded" | "partial" | "missed" | "unverified";

/**
 * One work step that missed or exceeded its prescription by more than noise,
 * or could not be paired. Labels are deliberately absent — a step label here
 * runs to a paragraph of coaching prose, and the reader has the prescription
 * in front of them.
 */
export interface FlaggedStep {
  /** Position in the flattened planned step list. */
  index: number;
  /**
   * 1-based position of this step's rep among the session's work reps — the
   * structural position recurrence and a fade are read at.
   */
  workRep: number;
  repIndex?: number;
  repCount?: number;
  stepInRep?: number;
  durationSeconds?: number;
  target?: PowerTarget;
  outcome: StepOutcome;
  verdict: StepVerdict;
  verdictBasis: VerdictBasis;
  deltas?: {
    watts?: number;
    wattsFraction?: number;
    cadence?: number;
  };
  cadenceVerdict?: CadenceVerdict;
  /** Carried only when non-trivial, where it qualifies a normalized-power read. */
  coastingFraction?: number;
}

/** One key session, reduced to what a coach reads. */
export interface DigestSession {
  eventId?: number;
  activityId?: string;
  date?: string;
  name?: string;
  outcome: SessionOutcome;
  /**
   * Set on a `partial` session whose misses are its last two or more reps and
   * nothing earlier: the work faded rather than missing at random.
   */
  fade?: true;
  /**
   * Set on a `partial` session when another `partial` session in the window
   * missed a rep in the same position (rep 1 in both, say).
   */
  recursInWindow?: true;
  executionRecord: ExecutionRecord;
  /** Set when the derived intervals were used and are known to have drifted. */
  executionRecordNote?: string;
  alignmentBasis: AlignmentBasis;
  /** Work steps in the prescription, by the label vocabulary. */
  workSteps: number;
  /**
   * Steps whose label declared no role. Reported rather than hidden: a genuine
   * work step with an unrecognised label is invisible to the step lens, and
   * this count is what makes that visible instead of silent.
   */
  unclassifiedSteps: number;
  flagged: FlaggedStep[];
  middleBandPlannedSeconds?: number;
  middleBandDeliveredSeconds?: number;
  middleBandDeliveredFraction?: number;
  /** Present when the step lens refused; the session is unverified on it. */
  reason?: ReviewReason;
  message?: string;
}

export interface ExecutionDigestResult {
  oldest: string;
  newest: string;
  status: DigestStatus;
  /**
   * The date the coaching log's `reviewed-through` advances to on write —
   * `newest` when the review ran, absent when it was skipped.
   */
  reviewedThrough?: string;
  /** Set on a skip: why there was nothing to review. */
  message?: string;
  /** The window's dose. Absent on a skip and where the frame did not resolve. */
  middleBand?: MiddleBandRollup;
  sessions: DigestSession[];
  /** Sessions in the window excluded from the dose sums, and why. */
  excluded: Array<Omit<ExcludedSession, "message">>;
  /**
   * Planned events in the window carrying work steps below the key-session
   * floor — not reviewed rep by rep, counted so the window's shape is visible.
   */
  nonKeySessions: number;
}

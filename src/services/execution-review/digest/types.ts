import type {
  AlignmentBasis,
  CadenceVerdict,
  ExecutionRecord,
  PowerTarget,
  ReviewReason,
  StepVerdict,
  VerdictBasis,
} from "../steps/types.js";
import type {
  ExcludedSession,
  MiddleBandRollup,
  PartitionBand,
  ZoneComparisonRow,
} from "../bands/types.js";

/**
 * Why a window produced no step-level review. `no-key-session` is the skip the
 * coaching log's watermark respects — it leaves `reviewed-through` alone.
 */
export type DigestStatus = "reviewed" | "skipped";

/**
 * One work step that survived the mechanical filter: it missed its prescription
 * on power or on cadence by more than noise. Labels are deliberately absent —
 * a step label here runs to a paragraph of coaching prose, and the reader has
 * the prescription in front of them.
 */
export interface FlaggedStep {
  /** Position in the flattened planned step list. */
  index: number;
  repIndex?: number;
  repCount?: number;
  stepInRep?: number;
  durationSeconds?: number;
  target?: PowerTarget;
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

/** A session's cadence prescription, rolled up: a miss is one session finding. */
export interface CadenceRollup {
  /** Work steps that prescribed a cadence and recorded one. */
  judged: number;
  /** Of those, how many missed their prescribed cadence. */
  missed: number;
}

/** One key session, reduced to what a coach reads. */
export interface DigestSession {
  eventId?: number;
  activityId?: string;
  date?: string;
  name?: string;
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
  cadence?: CadenceRollup;
  middleBandPlannedSeconds?: number;
  middleBandDeliveredSeconds?: number;
  middleBandDeliveredFraction?: number;
  platformCompliance?: number;
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
  zones?: ZoneComparisonRow[];
  boundaries?: PartitionBand[];
  sessions: DigestSession[];
  /** Sessions in the window excluded from the dose sums, and why. */
  excluded: Array<Omit<ExcludedSession, "message">>;
  /**
   * Planned events in the window carrying work steps below the key-session
   * floor — not reviewed rep by rep, counted so the window's shape is visible.
   */
  nonKeySessions: number;
}

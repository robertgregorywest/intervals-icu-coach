import type { ZoneRow } from "../../athlete-anchors/index.js";

/**
 * Why a comparison produced no per-zone breakdown. Machine-readable so callers
 * can distinguish the dead ends from each other — the lens exists to stop
 * silent gap-filling, so every empty result names its cause rather than
 * reporting a distribution of zeroes.
 */
export type DistributionReason =
  | "no-paired-event"
  | "no-paired-activity"
  | "no-structured-steps"
  | "no-recorded-power"
  | "no-coaching-zones";

/**
 * One band of the bucketing frame. Disjoint and total by construction, derived
 * from the coaching zones' lower bounds — see `zones.ts`. `highW` is exclusive;
 * the top band carries no upper bound.
 */
export interface PartitionBand {
  name: ZoneRow["name"];
  lowW: number;
  /** Absent on the top band, which is open-ended. */
  highW?: number;
  /**
   * The coaching band this was derived from, whose upper bound is wider because
   * the coaching bands overlap. Carried so a reader can see the two frames are
   * not the same thing.
   */
  coachingHighW: number;
}

/** Planned against delivered for one band of the frame. */
export interface ZoneComparisonRow {
  zone: ZoneRow["name"];
  lowW: number;
  highW?: number;
  plannedSeconds: number;
  deliveredSeconds: number;
  /** Delivered minus planned. Negative is a shortfall at that intensity. */
  deltaSeconds: number;
}

/**
 * The tempo-through-threshold window the coaching philosophy treats as the
 * primary judge of a build week. Its bounds are its own — a percentage of FTP —
 * not a sum of whichever bands happen to approximate it.
 */
export interface MiddleBandRollup {
  lowW: number;
  highW: number;
  lowPctFtp: number;
  highPctFtp: number;
  plannedSeconds: number;
  deliveredSeconds: number;
  deltaSeconds: number;
  /**
   * Delivered as a fraction of planned. Absent when nothing was prescribed in
   * the band, where the fraction would be a division by zero rather than a
   * perfect score.
   */
  deliveredFraction?: number;
}

/** A planned step whose prescribed power could not be placed in the frame. */
export interface UnbucketedStep {
  index: number;
  label?: string;
  durationSeconds?: number;
  /** Why the target could not be resolved to watts. */
  reason: string;
}

/** A planned step whose prescribed range straddled a band boundary. */
export interface BoundarySpanningStep {
  index: number;
  label?: string;
  lowW: number;
  highW: number;
  /** The band its midpoint put it in. */
  assignedZone: ZoneRow["name"];
  midpointW: number;
}

export interface IntensityDistributionResult {
  activityId?: string;
  eventId?: number;
  activityName?: string;
  eventName?: string;
  date?: string;
  /** The frame the seconds were bucketed into. Absent on a dead end. */
  boundaries?: PartitionBand[];
  /** Absent when the coaching zones could not be resolved. */
  zones?: ZoneComparisonRow[];
  /** Reported even without a zone frame — its bounds do not depend on one. */
  middleBand?: MiddleBandRollup;
  plannedTotalSeconds: number;
  /**
   * Sums to the count of recorded power samples, which is the activity's
   * recording time — not its elapsed time. A session with a long pause reports
   * less than its elapsed duration, correctly.
   */
  deliveredTotalSeconds: number;
  unbucketedSteps: UnbucketedStep[];
  boundarySpanningSteps: BoundarySpanningStep[];
  reason?: DistributionReason;
  message?: string;
}

/** One session's contribution to a range aggregate. */
export interface RangeSessionRow {
  date?: string;
  activityId?: string;
  eventId?: number;
  name?: string;
  middleBandPlannedSeconds: number;
  middleBandDeliveredSeconds: number;
  middleBandDeliveredFraction?: number;
}

/** A session in the range that contributed to no sum, and why. */
export interface ExcludedSession {
  date?: string;
  activityId?: string;
  eventId?: number;
  name?: string;
  reason: DistributionReason;
  message: string;
}

export interface IntensityDistributionRangeResult {
  oldest: string;
  newest: string;
  boundaries?: PartitionBand[];
  zones?: ZoneComparisonRow[];
  middleBand?: MiddleBandRollup;
  /** Per-session detail, so a pattern across sessions is visible in the sums. */
  sessions: RangeSessionRow[];
  /** Unpaired or unreadable sessions, excluded from every sum above. */
  excluded: ExcludedSession[];
}

export type { ZoneRow };

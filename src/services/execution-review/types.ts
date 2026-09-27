import type { PlannedVsActualResult } from "./steps/types.js";
import type {
  IntensityDistributionRangeResult,
  IntensityDistributionResult,
} from "./bands/types.js";
import type { ExecutionDigestResult } from "./digest/types.js";

/** One session, named by whichever half the caller has — exactly one. */
export interface SessionRef {
  activityId?: string;
  eventId?: number;
}

/** A **Review window**, both ends inclusive, YYYY-MM-DD. */
export interface WindowRef {
  oldest: string;
  newest: string;
}

export interface ComparePlannedVsActualOptions extends SessionRef {
  tolerance?: number;
}

/**
 * Execution review: the step lens and the band lens over sessions paired by the
 * **Paired session loader**, and the **Execution digest** over both.
 *
 * Every call judges against one snapshot of the athlete's anchors, so each lens
 * reads a plan at the same FTP and buckets it into the same MAP-zone frame. A
 * session call throws on both-or-neither identifiers, and a window call on a
 * window failing its guard, before any fetch.
 */
export interface IExecutionReview {
  /** The step lens: each **Planned step** against its **Delivered interval**. */
  comparePlannedVsActual(
    options: ComparePlannedVsActualOptions
  ): Promise<PlannedVsActualResult>;
  /** The band lens over one session. */
  compareIntensityDistribution(
    options: SessionRef
  ): Promise<IntensityDistributionResult>;
  /** The band lens over a **Review window**, summed across its sessions. */
  compareIntensityDistributionRange(
    options: WindowRef
  ): Promise<IntensityDistributionRangeResult>;
  /**
   * The **Execution digest** of a **Review window**. Both lenses read the one
   * loaded window, so each event and ride is fetched at most once.
   */
  getExecutionDigest(options: WindowRef): Promise<ExecutionDigestResult>;
}

import type { Activity } from "../../activities/index.js";
import type { IntervalsEvent } from "../../../types.js";
import type { IPrescription } from "../../prescription/index.js";
import type { IAthleteAnchors } from "../../athlete-anchors/index.js";
import type { PairedSession, Unpaired } from "../paired/types.js";
import { reviewSession, type RawPowerStream } from "./review.js";
import type { ExecutionCandidate } from "./delivered.js";
import type {
  PlannedVsActualResult,
  ReviewReason,
  SessionRollup,
} from "./types.js";

export interface ReviewOptions {
  tolerance: number;
  /** Resolves the FTP the plan is read at. */
  anchors: IAthleteAnchors;
  /** Reads the plan into the steps that are judged. */
  prescription: IPrescription;
}

/**
 * The step lens over one loaded session: each **Planned step** judged against
 * the **Delivered interval** paired to it, read from the best **Execution
 * record** that aligns at all.
 */
export async function reviewPairedSession(
  session: PairedSession,
  options: ReviewOptions
): Promise<PlannedVsActualResult> {
  const { event, activity } = session;
  const { tolerance } = options;

  const ftp = await options.anchors.planFtp(event, activity);
  const { steps: planned, totalSeconds } = options.prescription.read(
    event.workout_doc,
    { ftp }
  );

  if (planned.length === 0) {
    return refuse(
      activity,
      event,
      tolerance,
      "no-structured-steps",
      `Planned event ${event.id} carries no structured workout steps, so ` +
        "there is nothing to compare the ride against."
    );
  }

  const [ride, candidates, powerStream] = await Promise.all([
    session.detail(),
    session.executionRecord(),
    powerStreamOf(session),
  ]);

  if (candidates.length === 0) {
    return refuse(
      ride,
      event,
      tolerance,
      "no-intervals",
      `Activity ${ride.id} has neither recorded laps nor detected ` +
        "intervals, so per-step delivery cannot be read. Whole-activity " +
        "averages are not a substitute.",
      totalSeconds
    );
  }

  const rollupInputs = {
    plannedLoad: event.icu_training_load,
    actualLoad: numberOrUndefined(ride.icu_training_load),
    plannedDurationSeconds: totalSeconds,
    actualDurationSeconds: numberOrUndefined(ride.moving_time),
    platformCompliance: numberOrUndefined(ride.compliance),
  };

  const chosen = pickCandidate(candidates, (candidate) =>
    reviewSession({
      planned,
      intervals: candidate.intervals,
      tolerance,
      powerStream,
      ...rollupInputs,
    })
  );

  return {
    activityId: ride.id,
    eventId: event.id,
    activityName: ride.name,
    eventName: event.name,
    date: ride.start_date_local,
    tolerance,
    executionRecord: chosen.candidate.source,
    ...(chosen.candidate.note
      ? { executionRecordNote: chosen.candidate.note }
      : {}),
    ...chosen.core,
  };
}

/** A half-session reviewed: no steps, the named reason, and the roll-up. */
export function unpairedReview(
  found: Unpaired,
  tolerance: number
): PlannedVsActualResult {
  return refuse(
    found.activity,
    found.event,
    tolerance,
    found.reason,
    found.message
  );
}

/**
 * The raw power/time streams behind the normalized-power verdict. Read
 * best-effort: a failure (or an activity with no recorded power) is not a
 * comparison failure, it just means every step falls back to its average-watts
 * verdict.
 */
async function powerStreamOf(
  session: PairedSession
): Promise<RawPowerStream | undefined> {
  let streams;
  try {
    streams = await session.streams();
  } catch {
    return undefined;
  }

  const { watts, time } = streams;
  if (!watts?.length || !time?.length) return undefined;

  return { watts, time };
}

/**
 * Every dead end returns the same shape: an empty step list, a named reason,
 * and the roll-up, which still answers the coarse question.
 *
 * `executionRecord` reports the source that would have been read, so a refusal
 * still says what it was looking at.
 */
function refuse(
  activity: Activity | undefined,
  event: IntervalsEvent | undefined,
  tolerance: number,
  reason: ReviewReason,
  message: string,
  plannedDurationSeconds?: number
): PlannedVsActualResult {
  const rollup: SessionRollup = {
    plannedLoad: event?.icu_training_load,
    actualLoad: numberOrUndefined(activity?.icu_training_load),
    plannedDurationSeconds:
      plannedDurationSeconds ?? numberOrUndefined(event?.moving_time),
    actualDurationSeconds: numberOrUndefined(activity?.moving_time),
    platformCompliance: numberOrUndefined(activity?.compliance),
    unplannedIntervals: [],
  };

  return {
    activityId: activity?.id,
    eventId: event?.id,
    activityName: activity?.name,
    eventName: event?.name,
    date: activity?.start_date_local ?? event?.start_date_local,
    tolerance,
    executionRecord: "detected-intervals",
    alignmentBasis: "none",
    matchedFraction: 0,
    steps: [],
    rollup,
    reason,
    message,
  };
}

type ReviewCore = ReturnType<typeof reviewSession>;

/**
 * Review each candidate reading in preference order and keep the first that
 * aligns at all.
 *
 * Deliberately not "whichever aligns best". Detection re-cuts step boundaries
 * to whatever the power trace suggests, so it can out-score the laps precisely
 * on the sessions where it has invented the structure — the failure this
 * comparison exists to catch. The laps only lose when they explain nothing.
 * When no candidate aligns, the preferred one's refusal is the one reported.
 */
function pickCandidate(
  candidates: ExecutionCandidate[],
  review: (candidate: ExecutionCandidate) => ReviewCore
): { candidate: ExecutionCandidate; core: ReviewCore } {
  let first: { candidate: ExecutionCandidate; core: ReviewCore } | undefined;

  for (const candidate of candidates) {
    const core = review(candidate);
    if (!first) first = { candidate, core };
    if (core.alignmentBasis !== "none") return { candidate, core };
  }

  return first!;
}

function numberOrUndefined(v: unknown): number | undefined {
  return typeof v === "number" && Number.isFinite(v) ? v : undefined;
}

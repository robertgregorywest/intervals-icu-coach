import type { IEventsApi } from "../events/index.js";
import type { IActivitiesApi } from "../activities/index.js";
import type { IntervalsEvent } from "../../types.js";
import {
  DEFAULT_TOLERANCE,
  reviewPairedSession,
  unpairedReview,
} from "../session-review/index.js";
import type {
  AlignedStep,
  PlannedVsActualResult,
} from "../session-review/types.js";
import {
  distributeWindow,
  distributionFrame,
  type CoachingZones,
} from "../intensity-distribution/index.js";
import type {
  IntensityDistributionRangeResult,
  RangeSessionRow,
} from "../intensity-distribution/types.js";
import { readPrescription, type PlannedStep } from "../prescription/index.js";
import { planFtp } from "../athlete-anchors/index.js";
import {
  createPairedSessionLoader,
  type LoadedWindow,
  type PairedSessionLoader,
} from "../paired-sessions/index.js";
import type {
  CadenceRollup,
  DigestSession,
  ExecutionDigestResult,
  FlaggedStep,
  GetExecutionDigestOptions,
  IExecutionDigest,
} from "./types.js";

/**
 * A session counts as key when it prescribes a work step at or above this.
 *
 * Anchored on FTP rather than on the MAP zones, to sit in the same frame as the
 * middle band the dose is judged in — the sweet-spot floor is the bottom of the
 * work the philosophy treats as a build week's substance.
 */
export const KEY_SESSION_FLOOR_PCT_FTP = 88;

/**
 * Power miss on a range target smaller than this is noise, not a finding: the
 * verdict on a band step is directional with no tolerance, so a delivery a few
 * watts outside its own band returns `over`/`under` with nothing behind it.
 * Point targets carry the comparison's own tolerance and are not re-filtered.
 */
export const RANGE_TARGET_NOISE_FRACTION = 0.03;

/** Below this, a coasting fraction says nothing about a normalized-power read. */
const COASTING_WORTH_REPORTING = 0.05;

export interface ExecutionDigestDeps {
  eventsApi: IEventsApi;
  activitiesApi: IActivitiesApi;
  /** The athlete's FTP, for events whose own and paired ride carry none. */
  getFtp(): Promise<number | null>;
  /** The distribution's bucketing frame, read only when a session is key. */
  getCoachingZones(): Promise<CoachingZones>;
}

/**
 * The execution review's deterministic half, computed in one call.
 *
 * Selecting key sessions, running both lenses and dropping what the lenses call
 * an artefact is mechanical, and used to be re-derived by a forked model on
 * every review. What is left — recurrence, whether a test's overshoot is the
 * test working, what to change — is judgement, and stays with the coaching
 * thread that has the athlete's context loaded. See
 * `docs/adr/0010-work-steps-declared-in-the-label.md`.
 *
 * The window is loaded once and both lenses read the same sessions, so each
 * event and ride is fetched at most once however many lenses read it.
 */
export class ExecutionDigest implements IExecutionDigest {
  private loader: PairedSessionLoader;

  constructor(private deps: ExecutionDigestDeps) {
    this.loader = createPairedSessionLoader(deps);
  }

  async getExecutionDigest(
    options: GetExecutionDigestOptions
  ): Promise<ExecutionDigestResult> {
    const { oldest, newest } = options;
    // Throws on a window failing its guard, before any fetch.
    const loaded = await this.loader.loadWindow({ oldest, newest });

    let athleteFtp: Promise<number | null> | undefined;
    const lazyAthleteFtp = () => (athleteFtp ??= this.deps.getFtp());

    // Selection runs on the planned side, so a key session that was abandoned
    // or never started is selected and reported rather than silently missed.
    // It reads each plan at the FTP the review will judge it at, so a step is
    // selected and judged against the same target.
    const planned = await Promise.all(
      loaded.events
        .filter((e) => e.category === "WORKOUT")
        .map(async (event) =>
          plannedSummary(
            event,
            await planFtp(event, rideFor(loaded, event), lazyAthleteFtp)
          )
        )
    );
    const key = planned.filter((p) => p.isKey);

    if (key.length === 0) {
      return {
        oldest,
        newest,
        status: "skipped",
        message:
          `No key session in ${oldest}..${newest}: no planned work step at or ` +
          `above ${KEY_SESSION_FLOOR_PCT_FTP}% FTP. The watermark stays where ` +
          "it is.",
        sessions: [],
        excluded: [],
        nonKeySessions: planned.length,
      };
    }

    const [distribution, reviews] = await Promise.all([
      distributionFrame(this.deps.getCoachingZones).then((frame) =>
        distributeWindow(loaded, frame)
      ),
      Promise.all(
        key.map(({ event }) => {
          const found = loaded.lookup(event.id!);
          return found.session
            ? reviewPairedSession(found.session, {
                tolerance: DEFAULT_TOLERANCE,
                athleteFtp: lazyAthleteFtp,
              })
            : unpairedReview(found, DEFAULT_TOLERANCE);
        })
      ),
    ]);

    const doseByEvent = new Map<number, RangeSessionRow>();
    for (const row of distribution.sessions) {
      if (row.eventId !== undefined) doseByEvent.set(row.eventId, row);
    }

    const sessions = reviews.map((review, i) =>
      digestSession(review, key[i]!.steps, doseByEvent)
    );

    return {
      oldest,
      newest,
      status: "reviewed",
      reviewedThrough: newest,
      ...windowDose(distribution),
      sessions,
      excluded: distribution.excluded.map(({ message: _message, ...rest }) => ({
        ...rest,
      })),
      nonKeySessions: planned.length - key.length,
    };
  }
}

/** The ride paired to an event, whose FTP its plan is read at. */
function rideFor(loaded: LoadedWindow, event: IntervalsEvent) {
  return event.id !== undefined
    ? loaded.lookup(event.id).session?.activity
    : undefined;
}

interface PlannedSummary {
  event: IntervalsEvent;
  steps: PlannedStep[];
  isKey: boolean;
}

/**
 * Flatten one planned event and decide whether it is a key session: a work step
 * — declared as such by its label — prescribed at or above the sweet-spot floor.
 *
 * Intensity alone would select on any step, which is how a warm-up ramp topping
 * out at threshold used to pull an endurance ride into the review.
 */
function plannedSummary(
  event: IntervalsEvent,
  ftp: number | null
): PlannedSummary {
  const steps = readPrescription(event.workout_doc, { ftp }).steps;
  const floor = ftp ? (ftp * KEY_SESSION_FLOOR_PCT_FTP) / 100 : undefined;

  const isKey =
    event.id !== undefined &&
    floor !== undefined &&
    steps.some(
      (s) =>
        s.role === "work" &&
        s.midpointWatts !== undefined &&
        s.midpointWatts >= floor
    );

  return { event, steps, isKey };
}

/**
 * Reduce one comparison to the work steps that missed their prescription.
 *
 * Every drop here is one the lenses call an artefact: a step whose label
 * declares no work role (a warm-up, a recovery step, a cool-down), a step that
 * met both its power and its cadence, and a band step outside its band by less
 * than noise. What survives is a rep that did not do what it was asked to.
 */
export function digestSession(
  review: PlannedVsActualResult,
  planned: PlannedStep[],
  doseByEvent: Map<number, RangeSessionRow>
): DigestSession {
  const workIndexes = new Set(
    planned.filter((s) => s.role === "work").map((s) => s.index)
  );
  const work = review.steps.filter((s) => workIndexes.has(s.index));
  const dose =
    review.eventId !== undefined ? doseByEvent.get(review.eventId) : undefined;

  return {
    eventId: review.eventId,
    activityId: review.activityId,
    date: review.date?.slice(0, 10),
    name: review.eventName,
    executionRecord: review.executionRecord,
    ...(review.executionRecordNote
      ? { executionRecordNote: review.executionRecordNote }
      : {}),
    alignmentBasis: review.alignmentBasis,
    workSteps: workIndexes.size,
    unclassifiedSteps: planned.length - workIndexes.size,
    flagged: work.filter(flagged).map(reduceStep),
    ...cadenceRollup(work),
    middleBandPlannedSeconds: dose?.middleBandPlannedSeconds,
    middleBandDeliveredSeconds: dose?.middleBandDeliveredSeconds,
    middleBandDeliveredFraction: dose?.middleBandDeliveredFraction,
    platformCompliance: review.rollup.platformCompliance,
    ...(review.reason
      ? { reason: review.reason, message: review.message }
      : {}),
  };
}

/** Whether a work step missed its prescription by more than noise. */
function flagged(step: AlignedStep): boolean {
  if (step.cadenceVerdict && step.cadenceVerdict !== "on-target") return true;
  if (step.verdict === "on-target") return false;
  if (step.verdict === "unmatched" || step.verdict === "not-attempted")
    return true;

  const isRange =
    step.planned.target?.low !== undefined && step.planned.target.ramp !== true;
  if (!isRange) return true;

  const fraction = Math.abs(step.deltas?.wattsFraction ?? 0);
  return fraction >= RANGE_TARGET_NOISE_FRACTION;
}

function reduceStep(step: AlignedStep): FlaggedStep {
  const coasting = step.delivered?.coastingFraction;
  return {
    index: step.index,
    ...(step.repIndex !== undefined
      ? { repIndex: step.repIndex, repCount: step.repCount }
      : {}),
    ...(step.stepInRep !== undefined ? { stepInRep: step.stepInRep } : {}),
    durationSeconds: step.planned.durationSeconds,
    target: step.planned.target,
    verdict: step.verdict,
    verdictBasis: step.verdictBasis,
    ...(step.deltas
      ? {
          deltas: {
            watts: step.deltas.watts,
            wattsFraction: step.deltas.wattsFraction,
            cadence: step.deltas.cadence,
          },
        }
      : {}),
    ...(step.cadenceVerdict ? { cadenceVerdict: step.cadenceVerdict } : {}),
    ...(coasting !== undefined && coasting >= COASTING_WORTH_REPORTING
      ? { coastingFraction: coasting }
      : {}),
  };
}

/**
 * Cadence across the session's work steps. A cadence missed on every rep is one
 * finding about the session, not a detail on each rep, so the count travels
 * beside the steps rather than only inside them.
 */
function cadenceRollup(work: AlignedStep[]): { cadence?: CadenceRollup } {
  const judged = work.filter((s) => s.cadenceVerdict !== undefined);
  if (judged.length === 0) return {};
  return {
    cadence: {
      judged: judged.length,
      missed: judged.filter((s) => s.cadenceVerdict !== "on-target").length,
    },
  };
}

function windowDose(
  distribution: IntensityDistributionRangeResult
): Pick<ExecutionDigestResult, "middleBand" | "zones" | "boundaries"> {
  return {
    ...(distribution.middleBand ? { middleBand: distribution.middleBand } : {}),
    ...(distribution.zones ? { zones: distribution.zones } : {}),
    ...(distribution.boundaries ? { boundaries: distribution.boundaries } : {}),
  };
}

export function createExecutionDigest(
  deps: ExecutionDigestDeps
): ExecutionDigest {
  return new ExecutionDigest(deps);
}

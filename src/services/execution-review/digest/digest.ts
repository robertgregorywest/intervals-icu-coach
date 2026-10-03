import type { IntervalsEvent } from "../../../types.js";
import { DEFAULT_TOLERANCE } from "../steps/review.js";
import { reviewPairedSession, unpairedReview } from "../steps/lens.js";
import type { AlignedStep, PlannedVsActualResult } from "../steps/types.js";
import type {
  IntensityDistributionRangeResult,
  RangeSessionRow,
} from "../bands/types.js";
import type {
  IPrescription,
  PlannedStep,
  Prescription,
} from "../../prescription/index.js";
import type { AthleteAnchors } from "../../athlete-anchors/index.js";
import type { LoadedWindow } from "../paired/types.js";
import type {
  DigestSession,
  ExecutionDigestResult,
  FlaggedStep,
  SessionOutcome,
  StepOutcome,
} from "./types.js";

/**
 * Power miss on a range target smaller than this is noise, not a finding: the
 * verdict on a band step is directional with no tolerance, so a delivery a few
 * watts outside its own band returns `over`/`under` with nothing behind it.
 * Point targets carry the comparison's own tolerance and are not re-filtered.
 */
export const RANGE_TARGET_NOISE_FRACTION = 0.03;

/** Below this, a coasting fraction says nothing about a normalized-power read. */
const COASTING_WORTH_REPORTING = 0.05;

/**
 * The fewest trailing missed reps that read as a fade. One light last rep is
 * as likely noise as one light first rep; two in a row at the end is the work
 * running out.
 */
export const FADE_MIN_REPS = 2;

/**
 * The execution review's deterministic half over one loaded **Review window**.
 *
 * Selecting key sessions, running both lenses, dropping what the lenses call
 * an artefact and reading each session to a **Session outcome** is mechanical.
 * What is left — whether a partial miss continues an open thread, and what to
 * change — is judgement, and stays with the coaching thread that has the
 * athlete's context loaded. See `docs/adr/0010-work-steps-declared-in-the-label.md`
 * and `docs/adr/0015-session-outcome-computed-in-the-digest.md`.
 *
 * `athlete` is the athlete's anchors read once for the call, `prescription`
 * reads each plan against them, and
 * `distribution` the band lens over the same window — read only when a session
 * is key, so a skipped window fetches no streams.
 */
export async function digestWindow(
  loaded: LoadedWindow,
  athlete: AthleteAnchors,
  prescription: IPrescription,
  distribution: () => Promise<IntensityDistributionRangeResult>
): Promise<ExecutionDigestResult> {
  const { oldest, newest } = loaded.window;

  // Selection runs on the planned side, so a key session that was abandoned
  // or never started is selected and reported rather than silently missed.
  // It reads each plan the way the review will judge it, so a step is
  // selected and judged against the same target.
  const planned = loaded.events
    .filter((e) => e.category === "WORKOUT")
    .map((event) =>
      plannedSummary(
        prescription.readPlanned(event, rideFor(loaded, event), athlete),
        event
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
        `above ${prescription.keySessionFloorPctFtp}% FTP. The watermark stays where ` +
        "it is.",
      sessions: [],
      excluded: [],
      nonKeySessions: planned.length,
    };
  }

  const [dose, reviews] = await Promise.all([
    distribution(),
    Promise.all(
      key.map(({ event }) => {
        const found = loaded.lookup(event.id!);
        return found.session
          ? reviewPairedSession(found.session, {
              tolerance: DEFAULT_TOLERANCE,
              athlete,
              prescription,
            })
          : unpairedReview(found, DEFAULT_TOLERANCE);
      })
    ),
  ]);

  const doseByEvent = new Map<number, RangeSessionRow>();
  for (const row of dose.sessions) {
    if (row.eventId !== undefined) doseByEvent.set(row.eventId, row);
  }

  const sessions = markRecurrence(
    reviews.map((review, i) =>
      digestSession(review, key[i]!.steps, doseByEvent)
    )
  );

  return {
    oldest,
    newest,
    status: "reviewed",
    reviewedThrough: newest,
    ...(dose.middleBand ? { middleBand: dose.middleBand } : {}),
    sessions,
    excluded: dose.excluded.map(({ message: _message, ...rest }) => ({
      ...rest,
    })),
    nonKeySessions: planned.length - key.length,
  };
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
 * Read one planned event and decide whether it is a key session: a work step
 * — declared as such by its label — prescribed at or above the sweet-spot floor.
 * The Prescription module holds that rule; an event with no id cannot be
 * paired, so it is never selected.
 *
 * Intensity alone would select on any step, which is how a warm-up ramp topping
 * out at threshold used to pull an endurance ride into the review.
 */
function plannedSummary(
  { steps, keySession }: Prescription,
  event: IntervalsEvent
): PlannedSummary {
  return { event, steps, isKey: event.id !== undefined && keySession };
}

/**
 * Reduce one comparison to its **Session outcome** and the work steps behind it.
 *
 * Every drop here is one the lenses call an artefact: a step whose label
 * declares no work role (a warm-up, a recovery step, a cool-down), a step that
 * met both its power and its cadence, a band step outside its band by less
 * than noise, and an open-ended step ridden over its floor. What survives is a
 * rep that did not do what it was asked to, or did more.
 */
export function digestSession(
  review: PlannedVsActualResult,
  planned: PlannedStep[],
  doseByEvent: Map<number, RangeSessionRow>
): DigestSession {
  const work = planned.filter((s) => s.role === "work");
  const byIndex = new Map(work.map((s) => [s.index, s]));
  const judged = review.steps.flatMap((step) => {
    const plan = byIndex.get(step.index);
    return plan ? [{ step, plan, outcome: stepOutcome(step, plan) }] : [];
  });
  const flagged = judged.filter((j) => j.outcome !== undefined);
  const dose =
    review.eventId !== undefined ? doseByEvent.get(review.eventId) : undefined;
  const outcome = sessionOutcome(review, work.length, judged);

  return {
    eventId: review.eventId,
    activityId: review.activityId,
    date: review.date?.slice(0, 10),
    name: review.eventName,
    outcome,
    ...(outcome === "partial" && fades(work, judged) ? { fade: true } : {}),
    executionRecord: review.executionRecord,
    ...(review.executionRecordNote
      ? { executionRecordNote: review.executionRecordNote }
      : {}),
    alignmentBasis: review.alignmentBasis,
    workSteps: work.length,
    unclassifiedSteps: planned.length - work.length,
    flagged: flagged.map(({ step, outcome }) =>
      reduceStep(step, outcome!, workRepOf(work, step.index))
    ),
    middleBandPlannedSeconds: dose?.middleBandPlannedSeconds,
    middleBandDeliveredSeconds: dose?.middleBandDeliveredSeconds,
    middleBandDeliveredFraction: dose?.middleBandDeliveredFraction,
    ...(review.reason
      ? { reason: review.reason, message: review.message }
      : {}),
  };
}

interface JudgedStep {
  step: AlignedStep;
  plan: PlannedStep;
  outcome: StepOutcome | undefined;
}

/**
 * What one work step's delivery means, or undefined when it met its
 * prescription. A cadence miss outranks a power exceedance: a rep ridden hard
 * at the wrong cadence was not the rep prescribed. A cadence ridden over its
 * target is neither — it says nothing about whether the work can progress.
 */
function stepOutcome(
  step: AlignedStep,
  plan: PlannedStep
): StepOutcome | undefined {
  if (step.verdict === "unmatched") return "unjudged";
  if (step.verdict === "not-attempted") return "missed";
  if (step.cadenceVerdict === "under") return "missed";
  if (!beyondNoise(step)) return undefined;
  if (step.verdict === "under") return "missed";
  if (step.verdict === "over" && !plan.openEnded) return "exceeded";
  return undefined;
}

/**
 * Whether a power verdict is more than noise. A point target carries the
 * comparison's own tolerance and is not re-filtered.
 */
function beyondNoise(step: AlignedStep): boolean {
  if (step.verdict === "on-target") return false;
  const isRange =
    step.planned.target?.low !== undefined && step.planned.target.ramp !== true;
  if (!isRange) return true;
  const fraction = Math.abs(step.deltas?.wattsFraction ?? 0);
  return fraction >= RANGE_TARGET_NOISE_FRACTION;
}

/**
 * The **Session outcome**. Drifted rep boundaries make the step lens
 * unverified rather than caveated: a rep merged into its recovery reads as a
 * miss that never happened.
 */
function sessionOutcome(
  review: PlannedVsActualResult,
  workSteps: number,
  judged: JudgedStep[]
): SessionOutcome {
  const paired = judged.filter((j) => j.outcome !== "unjudged");
  if (
    review.reason !== undefined ||
    review.alignmentBasis === "none" ||
    review.executionRecordNote !== undefined ||
    workSteps === 0 ||
    paired.length === 0
  ) {
    return "unverified";
  }
  const missed = paired.filter((j) => j.outcome === "missed").length;
  if (missed === paired.length) return "missed";
  if (missed > 0) return "partial";
  if (paired.some((j) => j.outcome === "exceeded")) return "exceeded";
  return "landed";
}

/**
 * A work step's rep: its 1-based position among the session's work reps. The
 * work steps of one repetition of a repeat block (the over and the under) are
 * one rep; a work step written out on its own is a rep by itself.
 */
function workRepOf(work: PlannedStep[], index: number): number {
  const keys: string[] = [];
  for (const s of work) {
    const key =
      s.repIndex !== undefined
        ? `${s.sourceIndex}:${s.repIndex}`
        : `${s.index}`;
    if (keys.at(-1) !== key) keys.push(key);
    if (s.index === index) return keys.length;
  }
  return keys.length;
}

/** The session's missed work reps, by position. */
function missedReps(work: PlannedStep[], judged: JudgedStep[]): Set<number> {
  return new Set(
    judged
      .filter((j) => j.outcome === "missed")
      .map((j) => workRepOf(work, j.plan.index))
  );
}

/**
 * Whether the misses are the session's last reps and nothing before them — at
 * least `FADE_MIN_REPS` of them, with an earlier rep that landed.
 */
function fades(work: PlannedStep[], judged: JudgedStep[]): boolean {
  const missed = missedReps(work, judged);
  const reps = work.length ? workRepOf(work, work.at(-1)!.index) : 0;
  if (missed.size < FADE_MIN_REPS || missed.size >= reps) return false;
  for (let r = reps - missed.size + 1; r <= reps; r++) {
    if (!missed.has(r)) return false;
  }
  return true;
}

/**
 * Mark the `partial` sessions that missed a rep in the same position as
 * another `partial` session in the window. A `missed` session misses every
 * position, so it would make every partial one recur — it is left out.
 */
export function markRecurrence(sessions: DigestSession[]): DigestSession[] {
  const positions = sessions.map(
    (s) =>
      new Set(
        s.outcome === "partial"
          ? s.flagged
              .filter((f) => f.outcome === "missed")
              .map((f) => f.workRep)
          : []
      )
  );
  return sessions.map((s, i) => {
    const recurs = sessions.some(
      (_, j) => j !== i && [...positions[i]!].some((p) => positions[j]!.has(p))
    );
    return recurs ? { ...s, recursInWindow: true } : s;
  });
}

function reduceStep(
  step: AlignedStep,
  outcome: StepOutcome,
  workRep: number
): FlaggedStep {
  const coasting = step.delivered?.coastingFraction;
  return {
    index: step.index,
    workRep,
    ...(step.repIndex !== undefined
      ? { repIndex: step.repIndex, repCount: step.repCount }
      : {}),
    ...(step.stepInRep !== undefined ? { stepInRep: step.stepInRep } : {}),
    durationSeconds: step.planned.durationSeconds,
    target: step.planned.target,
    outcome,
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

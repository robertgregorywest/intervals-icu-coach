import type {
  DiscardedLine,
  ParseAnchors,
  ParseBasis,
} from "../workout-parser/index.js";
import type { IntervalsEvent, WorkoutDoc } from "../../types.js";
import type { StepRole } from "./roles.js";

export type { StepRole };

/** A prescribed cadence band, e.g. `85-95rpm`. Both ends inclusive. */
export interface CadenceRange {
  low: number;
  high: number;
}

/** A prescribed power target, normalised to watts. */
export interface PowerTarget {
  /** Point target, when the step prescribes a single wattage. */
  watts?: number;
  /** Band target, when the step prescribes a range. Both ends inclusive. */
  low?: number;
  high?: number;
  /**
   * True when `low`/`high` are the ends of a ramp rather than an acceptable
   * band. A ramp is judged against its midpoint: sitting at the bottom of a
   * 130→220 W ramp for the whole step is not on target, though it is "in range".
   */
  ramp?: boolean;
}

/**
 * One prescribed step after repeat blocks have been expanded — the unit of
 * comparison. A 3×(12min/4min) block yields six of these.
 */
export interface FlatPlannedStep {
  /** Position in the flattened list. */
  index: number;
  /** Index of the originating entry in `workout_doc.steps`. */
  sourceIndex: number;
  label?: string;
  durationSeconds?: number;
  target?: PowerTarget;
  /** Point cadence target, rpm. */
  cadence?: number;
  /** Band cadence target, when the step prescribes a range. */
  cadenceRange?: CadenceRange;
  /** 1-based repetition number, when this step came from a repeat block. */
  repIndex?: number;
  /** Total repetitions in that block. */
  repCount?: number;
  /** 1-based position within one repetition. */
  stepInRep?: number;
  /** Set when the target could not be normalised (e.g. percent with no FTP). */
  targetUnresolved?: string;
}

/**
 * A **Planned step** as the Prescription module hands it out: flattened, its
 * target resolved to watts, its **Work step** role read from its label, and the
 * one midpoint every lens takes a band at.
 */
export interface PlannedStep extends FlatPlannedStep {
  role: StepRole;
  /**
   * Set on an **Open-ended work step**: a test or primer whose target is a
   * floor, so delivering over it is the step working, not an exceedance.
   */
  openEnded?: true;
  /**
   * A point target's watts, or a band's midpoint — unrounded, since a half watt
   * is what the load arithmetic reproduces the platform with. Absent when the
   * target is unresolved or there is none.
   */
  midpointWatts?: number;
}

/**
 * The **Parse basis** of a prescription: the platform's own parse of a written
 * event, or a local parse of text that may never have been written.
 */
export type PrescriptionBasis = { source: "platform" } | ParseBasis;

/**
 * A step hard enough to be the session's intent whose label declares no work
 * role. The execution review will never judge it, which is the one way a real
 * miss goes unreported — so the workout's author hears about it at the write,
 * not three weeks later in a digest that is quietly missing a rep.
 */
export interface UnreviewableStep {
  index: number;
  label?: string;
  /** Prescribed watts — a point target, or the midpoint of a band. */
  watts: number;
}

/**
 * What a prescription reads as, once, for every lens that consumes it. Every
 * fact derived from the steps is computed here, so no caller re-derives it.
 */
export interface Prescription {
  /** Each carries its **Work step** role and the midpoint a band is taken at. */
  steps: PlannedStep[];
  basis: PrescriptionBasis;
  /** Step lines a local parse dropped, with the reason. Empty for a platform doc. */
  discarded: DiscardedLine[];
  /** Total prescribed seconds across the steps. */
  totalSeconds: number;
  /**
   * The key-session floor in watts, at the anchors' FTP. Absent when no FTP was
   * given: without one there is no floor, and nothing is judged against it.
   */
  keyFloorWatts?: number;
  /**
   * Whether some work step's midpoint sits at or above `keyFloorWatts` — the
   * one definition of a **Key session**. False when there is no floor.
   */
  keySession: boolean;
  /**
   * Steps at or above `keyFloorWatts` whose label carries no work word: the
   * `create_workout` warning. A warning, never a refusal — a ramp test's
   * unlabelled steps and a warm-up's build are both meant to go unjudged, and
   * the author is the one who knows which. Empty when there is no floor.
   */
  unreviewable: UnreviewableStep[];
}

/** Step count and prescribed time of workout text, repeats expanded. */
export interface PrescriptionShape {
  stepCount: number;
  /** Prescribed seconds across the counted steps. */
  totalSeconds: number;
  /** True when any step is prescribed by distance rather than time. */
  hasDistance: boolean;
}

/**
 * The **Prescription module**: the one pipeline from a platform doc or workout
 * text, plus anchors, to resolved **Planned steps** — so no two planned-side
 * readers can disagree about what was prescribed.
 */
export interface IPrescription {
  /**
   * The one pipeline: a platform doc or workout text, plus anchors, to resolved
   * Planned steps, with everything derived from them computed once.
   *
   * A `WorkoutDoc` is the platform's own parse of a written event and wins over
   * any local reading of the same text (ADR 0007); a string is workout text that
   * may never have been written, parsed locally. Zone targets resolve only when
   * `anchors` carries the power zones, percentages only when it carries FTP, and
   * a target the anchors cannot resolve is named on the step, never defaulted.
   */
  read(
    source: WorkoutDoc | string | undefined,
    anchors?: ParseAnchors
  ): Prescription;
  /**
   * A planned event's Prescription, read at its **Plan FTP** — the event's own
   * FTP, then its ride's, then the athlete's — with its FTP zones resolved
   * against the athlete's power zones. The one entry point for a session that
   * was planned and may have been ridden, so no lens stitches the FTP rule and
   * the read together itself, or forgets the zones.
   *
   * `athlete` is the athlete's anchors read once for the call: its FTP is the
   * last resort, its power zones resolve `Z<n>` steps.
   */
  readPlanned(
    event: Pick<IntervalsEvent, "workout_doc" | "icu_ftp">,
    ride: { icu_ftp?: unknown } | null | undefined,
    athlete: ParseAnchors
  ): Prescription;
  /** Step count and time of workout text; distance steps are counted and flagged. */
  shape(text: string): PrescriptionShape;
  /** The key-session floor as a percentage of FTP, for messages that quote it. */
  readonly keySessionFloorPctFtp: number;
}

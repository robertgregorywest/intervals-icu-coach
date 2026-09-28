import {
  createWorkoutParser,
  DISTANCE_STEP_DISCARDED,
  resolveZoneTargets,
  type ParseAnchors,
} from "../workout-parser/index.js";
import type { WorkoutDoc } from "../../types.js";
import { flattenPlannedSteps, plannedDuration } from "./planned.js";
import { stepRole } from "./roles.js";
import { unreviewableWorkSteps } from "./authoring.js";
import type {
  IPrescription,
  PlannedStep,
  PowerTarget,
  Prescription,
  PrescriptionBasis,
  PrescriptionShape,
} from "./types.js";

const parser = createWorkoutParser();

/**
 * A session counts as key when it prescribes a work step at or above this.
 *
 * Anchored on FTP rather than on the MAP zones, to sit in the same frame as the
 * middle band the dose is judged in — the sweet-spot floor is the bottom of the
 * work the philosophy treats as a build week's substance.
 */
const KEY_SESSION_FLOOR_PCT_FTP = 88;

export function createPrescription(): IPrescription {
  return {
    read: readPrescription,
    shape: prescriptionShape,
    keySessionFloorPctFtp: KEY_SESSION_FLOOR_PCT_FTP,
  };
}

/**
 * Read a prescription into resolved **Planned steps** — the one pipeline every
 * planned-side lens runs, so they cannot disagree about what was prescribed.
 * Zone targets resolve to watt bands, repeats expand, percentages resolve
 * against FTP, each step's **Work step** role is read from its label, and its
 * midpoint is taken once; the facts derived from the steps are taken here too.
 */
function readPrescription(
  source: WorkoutDoc | string | undefined,
  anchors: ParseAnchors = {}
): Prescription {
  const read = readSource(source, anchors);
  const doc = read.doc ? resolveZoneTargets(read.doc, anchors) : undefined;

  const steps: PlannedStep[] = flattenPlannedSteps(doc, {
    ftp: anchors.ftp,
  }).map((step) => {
    const midpointWatts = targetMidpoint(step.target);
    return {
      ...step,
      role: stepRole(step.label),
      ...(midpointWatts !== undefined ? { midpointWatts } : {}),
    };
  });

  const { ftp } = anchors;
  const keyFloorWatts = ftp
    ? (ftp * KEY_SESSION_FLOOR_PCT_FTP) / 100
    : undefined;

  return {
    steps,
    basis: read.basis,
    discarded: read.discarded,
    totalSeconds: plannedDuration(steps),
    ...(keyFloorWatts !== undefined ? { keyFloorWatts } : {}),
    keySession:
      keyFloorWatts !== undefined &&
      steps.some(
        (s) =>
          s.role === "work" &&
          s.midpointWatts !== undefined &&
          s.midpointWatts >= keyFloorWatts
      ),
    unreviewable: unreviewableWorkSteps(steps, keyFloorWatts),
  };
}

function readSource(
  source: WorkoutDoc | string | undefined,
  anchors: ParseAnchors
): Pick<Prescription, "basis" | "discarded"> & { doc?: WorkoutDoc } {
  if (typeof source === "string") {
    const parsed = parser.parse(source, anchors);
    return {
      doc: parsed.doc,
      basis: parsed.basis,
      discarded: parsed.discarded,
    };
  }
  const basis: PrescriptionBasis = { source: "platform" };
  return { doc: source, basis, discarded: [] };
}

/**
 * The single wattage a target is taken at: a point target's watts, a band's or
 * ramp's midpoint. Unrounded — the load arithmetic reproduces the platform's
 * figure only with the half watt kept. Undefined when there is no resolved
 * target.
 */
function targetMidpoint(target: PowerTarget | undefined): number | undefined {
  if (!target) return undefined;
  if (typeof target.watts === "number") return target.watts;
  if (typeof target.low === "number" && typeof target.high === "number") {
    return (target.low + target.high) / 2;
  }
  return undefined;
}

/**
 * How many steps workout text prescribes and for how long, repeats expanded —
 * read through the same parse the platform's is checked against, so a step the
 * platform would drop is not counted.
 *
 * A step prescribed by distance alone is the exception: the parse cannot time
 * it, but it is a real step (a run's `- 2km Z2`), so it counts and is flagged
 * rather than vanishing.
 */
function prescriptionShape(text: string): PrescriptionShape {
  const { steps, discarded, totalSeconds } = readPrescription(text);
  const distanceSteps = discarded
    .filter((d) => d.reason === DISTANCE_STEP_DISCARDED)
    .reduce((sum, d) => sum + (d.reps ?? 1), 0);

  return {
    stepCount: steps.length + distanceSteps,
    totalSeconds,
    hasDistance: distanceSteps > 0,
  };
}

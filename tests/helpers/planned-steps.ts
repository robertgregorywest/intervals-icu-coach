import {
  createPrescription,
  type PlannedStep,
} from "../../src/services/prescription/index.js";
import type { ParseAnchors } from "../../src/services/workout-parser/index.js";
import type { WorkoutDoc } from "../../src/types.js";

const prescription = createPrescription();

/**
 * A prescription's **Planned steps**, read through the real module — the steps
 * a lens under test would itself receive.
 */
export function readPlannedSteps(
  source: WorkoutDoc | string | undefined,
  anchors?: ParseAnchors
): PlannedStep[] {
  return prescription.read(source, anchors).steps;
}

/**
 * One hand-built Planned step, for a lens test that needs a target no workout
 * text would produce. Unclassified unless the test says otherwise, and its
 * midpoint taken as the Prescription module takes it — a point's watts, a
 * band's or ramp's centre — so the step reads as a real one would.
 */
export function plannedStep(partial: Partial<PlannedStep> = {}): PlannedStep {
  const target = partial.target;
  const midpointWatts =
    target?.watts ??
    (target?.low !== undefined && target.high !== undefined
      ? (target.low + target.high) / 2
      : undefined);
  return {
    index: 0,
    sourceIndex: 0,
    role: "unclassified",
    ...(midpointWatts !== undefined ? { midpointWatts } : {}),
    ...partial,
  };
}

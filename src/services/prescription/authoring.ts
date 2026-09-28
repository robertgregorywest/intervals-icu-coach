import type { PlannedStep, UnreviewableStep } from "./types.js";

/**
 * Steps prescribed at or above `floorWatts` whose label carries no work word.
 *
 * Judged against the same unrounded midpoint the digest selects on, so the
 * warning and the selection cannot disagree about a step on the floor. Returns
 * nothing at all when no FTP was available to set the floor.
 */
export function unreviewableWorkSteps(
  steps: PlannedStep[],
  floorWatts: number | undefined
): UnreviewableStep[] {
  if (!floorWatts) return [];

  return steps.flatMap((step) =>
    step.role === "unclassified" &&
    step.midpointWatts !== undefined &&
    step.midpointWatts >= floorWatts
      ? [{ index: step.index, label: step.label, watts: step.midpointWatts }]
      : []
  );
}

import type { IEventsApi } from "../events/index.js";
import type { IWorkoutLibrary } from "../workout-library/index.js";
import type { IAthleteAnchors } from "../athlete-anchors/index.js";
import { KEY_SESSION_FLOOR_PCT_FTP } from "../execution-review/index.js";
import {
  unreviewableWorkSteps,
  type UnreviewableStep,
} from "../prescription/index.js";
import type { IntervalsEvent, SportType } from "../../types.js";
import { buildEvent, workoutEvent } from "./builder.js";
import { updateEvent } from "./update.js";
import type { WorkoutPlan } from "./plan.js";
import type {
  EventChanges,
  IWorkoutScheduling,
  LibraryPlacement,
  ScheduledWorkouts,
  StrengthSession,
} from "./types.js";

export interface WorkoutSchedulingDeps {
  eventsApi: IEventsApi;
  workoutLibrary: IWorkoutLibrary;
  /** FTP and the power zones the unreviewable-step warning is judged at. */
  anchors: IAthleteAnchors;
}

export class WorkoutScheduling implements IWorkoutScheduling {
  constructor(private deps: WorkoutSchedulingDeps) {}

  async schedulePlan(plan: WorkoutPlan): Promise<ScheduledWorkouts> {
    return this.write(buildEvent(plan), { warn: true });
  }

  async scheduleLibraryWorkout(
    placement: LibraryPlacement
  ): Promise<ScheduledWorkouts> {
    const { workout } = await this.deps.workoutLibrary.get(placement.id);
    return this.write(
      workoutEvent({
        name: workout.name,
        date: placement.date,
        type: workout.type as SportType,
        description: workout.description ?? "",
        externalId: placement.externalId,
        color: placement.color,
      }),
      { warn: true }
    );
  }

  async scheduleStrength(session: StrengthSession): Promise<ScheduledWorkouts> {
    return this.write(workoutEvent({ ...session, type: "WeightTraining" }), {
      warn: false,
    });
  }

  updateEvent(id: number, changes: EventChanges): Promise<IntervalsEvent> {
    return updateEvent(this.deps.eventsApi, id, changes);
  }

  private async write(
    event: IntervalsEvent,
    { warn }: { warn: boolean }
  ): Promise<ScheduledWorkouts> {
    const events = await this.deps.eventsApi.createEvents([event]);
    if (!warn) return { events };
    const unreviewableSteps = await this.unreviewable(event.description);
    return unreviewableSteps.length > 0
      ? { events, unreviewableSteps }
      : { events };
  }

  /**
   * Best-effort: a warning is worth one athlete lookup, and worth nothing if it
   * can fail the write it is warning about. No FTP, or a lookup that throws, and
   * the workout is written with no warning rather than not written. The anchors
   * carry the power zones too, so a work step written as a zone is judged.
   */
  private async unreviewable(description: string): Promise<UnreviewableStep[]> {
    let anchors;
    try {
      anchors = await this.deps.anchors.getAthleteAnchors();
    } catch {
      return [];
    }

    const { ftp } = anchors;
    const floor = ftp ? (ftp * KEY_SESSION_FLOOR_PCT_FTP) / 100 : undefined;
    return unreviewableWorkSteps(description, floor, anchors);
  }
}

export function createWorkoutScheduling(
  deps: WorkoutSchedulingDeps
): WorkoutScheduling {
  return new WorkoutScheduling(deps);
}

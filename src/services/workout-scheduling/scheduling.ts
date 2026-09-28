import type { IEventsApi } from "../events/index.js";
import type { IWorkoutLibrary } from "../workout-library/index.js";
import type { IAthleteAnchors } from "../athlete-anchors/index.js";
import type { IPrescription, UnreviewableStep } from "../prescription/index.js";
import type { IWorkoutParser } from "../workout-parser/index.js";
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
  /** Reads the written text back, for the update guard and the warning. */
  prescription: IPrescription;
  /** Refuses a step label the platform would cut short. */
  workoutParser: IWorkoutParser;
}

export class WorkoutScheduling implements IWorkoutScheduling {
  constructor(private deps: WorkoutSchedulingDeps) {}

  async schedulePlan(plan: WorkoutPlan): Promise<ScheduledWorkouts> {
    return this.write(buildEvent(plan, this.deps.workoutParser), {
      warn: true,
    });
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
    return updateEvent(
      this.deps.eventsApi,
      this.deps.prescription,
      this.deps.workoutParser,
      id,
      changes
    );
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

    return this.deps.prescription.read(description, anchors).unreviewable;
  }
}

export function createWorkoutScheduling(
  deps: WorkoutSchedulingDeps
): WorkoutScheduling {
  return new WorkoutScheduling(deps);
}

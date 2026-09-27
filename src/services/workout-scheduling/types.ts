import type { UnreviewableStep } from "../prescription/index.js";
import type { EventCategory, IntervalsEvent, SportType } from "../../types.js";
import type { RepeatBlock, WorkoutPlan, WorkoutStep } from "./plan.js";

/** Where a saved library workout lands on the calendar. */
export interface LibraryPlacement {
  /** The library workout's id. */
  id: number;
  date: string;
  externalId?: string;
  color?: string;
}

/** A gym session: free-form prose, written as a WeightTraining event. */
export interface StrengthSession {
  name: string;
  date: string;
  description: string;
  externalId?: string;
  color?: string;
}

/** What a scheduling call wrote, and anything the author should hear about. */
export interface ScheduledWorkouts {
  events: IntervalsEvent[];
  /**
   * Steps at or above the key-session floor whose label declares no work
   * role. Absent when there are none, or when FTP could not be read.
   */
  unreviewableSteps?: UnreviewableStep[];
}

export interface EventChanges {
  name?: string;
  description?: string;
  steps?: Array<WorkoutStep | RepeatBlock>;
  notes?: string;
  date?: string;
  category?: EventCategory;
  type?: SportType;
  color?: string;
}

/** Writing a workout to the calendar, safely. */
export interface IWorkoutScheduling {
  /** Builds the plan's workout-text and writes it, with the unreviewable-step warning. */
  schedulePlan(plan: WorkoutPlan): Promise<ScheduledWorkouts>;
  /** Copies a library workout's description verbatim onto a date, with the warning. */
  scheduleLibraryWorkout(
    placement: LibraryPlacement
  ): Promise<ScheduledWorkouts>;
  /** Writes a strength session. Carries no warning — it has no power steps. */
  scheduleStrength(session: StrengthSession): Promise<ScheduledWorkouts>;
  /** Refuses any change that would silently destroy a workout's structure. */
  updateEvent(id: number, changes: EventChanges): Promise<IntervalsEvent>;
}

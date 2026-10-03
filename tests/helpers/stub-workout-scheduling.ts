import type { IWorkoutScheduling } from "../../src/services/workout-scheduling/index.js";

/**
 * A fully typed `IWorkoutScheduling` fake for Tool tests: the methods a test
 * supplies, and every other method rejecting when called. The module's own
 * behaviour is tested in `tests/services/workout-scheduling/`; a Tool test
 * checks only the call and the reshape.
 */
export function stubWorkoutScheduling(
  methods: Partial<IWorkoutScheduling> = {}
): IWorkoutScheduling {
  const unused =
    (name: keyof IWorkoutScheduling) => async (): Promise<never> => {
      throw new Error(`stubWorkoutScheduling: ${name} not stubbed`);
    };
  return {
    schedulePlan: unused("schedulePlan"),
    scheduleLibraryWorkout: unused("scheduleLibraryWorkout"),
    scheduleStrength: unused("scheduleStrength"),
    updateEvent: unused("updateEvent"),
    ...methods,
  };
}

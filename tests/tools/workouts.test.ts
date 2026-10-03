import { describe, it, expect, vi } from "vitest";
import {
  createWorkoutTool,
  createStrengthWorkoutTool,
  scheduleLibraryWorkoutTool,
} from "../../src/tools/workouts.js";
import type { IServices } from "../../src/index.js";
import type {
  IWorkoutScheduling,
  ScheduledWorkouts,
} from "../../src/services/workout-scheduling/index.js";
import type { IntervalsEvent } from "../../src/types.js";
import { stubWorkoutScheduling } from "../helpers/stub-workout-scheduling.js";

const written: IntervalsEvent = {
  id: 42,
  category: "WORKOUT",
  start_date_local: "2024-03-30T00:00:00",
  type: "Ride",
  name: "Threshold Intervals",
  description: "- Warmup 10m 60%\n\n- Threshold 10m 100%",
  external_id: "mcp-2024-03-30-threshold-intervals",
};

function servicesWith(methods: Partial<IWorkoutScheduling>) {
  return {
    workoutScheduling: stubWorkoutScheduling(methods),
  } as unknown as IServices;
}

const scheduled = (extra: Partial<ScheduledWorkouts> = {}) =>
  vi.fn(async () => ({ events: [written], ...extra }));

const reshaped = {
  success: true,
  created: 1,
  events: [
    {
      id: 42,
      name: "Threshold Intervals",
      start_date_local: "2024-03-30T00:00:00",
      description: "- Warmup 10m 60%\n\n- Threshold 10m 100%",
    },
  ],
};

describe("create_workout", () => {
  it("hands the plan to schedulePlan and reshapes what was written", async () => {
    const schedulePlan = scheduled();
    const args = {
      name: "Threshold Intervals",
      date: "2024-03-30",
      sportType: "Ride" as const,
      steps: [{ label: "Warmup", duration: "10m", target: "60%" }],
      notes: "Hold it.",
    };

    const result = await createWorkoutTool.handler(
      servicesWith({ schedulePlan }),
      args
    );

    expect(schedulePlan).toHaveBeenCalledWith(args);
    expect(result).toEqual(reshaped);
  });

  it("passes the unreviewable-step warning through", async () => {
    const unreviewableSteps = [{ index: 1, label: "Hard bit", watts: 300 }];
    const result = await createWorkoutTool.handler(
      servicesWith({ schedulePlan: scheduled({ unreviewableSteps }) }),
      {
        name: "Threshold",
        date: "2024-03-30",
        sportType: "Ride",
        steps: [{ label: "Hard bit", duration: "10m", target: "100%" }],
      }
    );
    expect(result.unreviewableSteps).toEqual(unreviewableSteps);
  });
});

describe("schedule_library_workout", () => {
  it("hands the placement to scheduleLibraryWorkout and reshapes", async () => {
    const scheduleLibraryWorkout = scheduled();
    const args = { id: 15, date: "2026-09-20", color: "blue" };

    const result = await scheduleLibraryWorkoutTool.handler(
      servicesWith({ scheduleLibraryWorkout }),
      args
    );

    expect(scheduleLibraryWorkout).toHaveBeenCalledWith(args);
    expect(result).toEqual(reshaped);
  });
});

describe("create_strength_workout", () => {
  it("hands the session to scheduleStrength and reshapes", async () => {
    const scheduleStrength = scheduled();
    const args = {
      name: "Gym",
      date: "2024-04-01",
      description: "Squats 3×5",
      externalId: "gym-123",
    };

    const result = await createStrengthWorkoutTool.handler(
      servicesWith({ scheduleStrength }),
      args
    );

    expect(scheduleStrength).toHaveBeenCalledWith(args);
    expect(result).toEqual(reshaped);
    expect(result).not.toHaveProperty("unreviewableSteps");
  });
});

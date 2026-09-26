import { describe, it, expect, vi } from "vitest";
import {
  createWorkoutTool,
  createStrengthWorkoutTool,
  scheduleLibraryWorkoutTool,
} from "../../src/tools/workouts.js";
import type { IIntervalsClient } from "../../src/index.js";
import { WorkoutBuilder } from "../../src/services/workout-builder/index.js";
import type { IntervalsEvent } from "../../src/types.js";

function createMockClient(
  returnEvents: IntervalsEvent[] = []
): IIntervalsClient {
  return {
    workoutBuilder: new WorkoutBuilder(),
    events: { createEvents: vi.fn().mockResolvedValue(returnEvents) },
  } as unknown as IIntervalsClient;
}

const createWorkout = createWorkoutTool.handler;
const createStrengthWorkout = createStrengthWorkoutTool.handler;
const scheduleLibraryWorkout = scheduleLibraryWorkoutTool.handler;

describe("createWorkout tool handler", () => {
  it("builds an event and calls createEvents", async () => {
    const returnedEvents: IntervalsEvent[] = [
      {
        id: 42,
        category: "WORKOUT",
        start_date_local: "2024-03-30T00:00:00",
        type: "Ride",
        name: "Threshold Intervals",
        description: "- Warmup 10m 60%\n\n3x\n- 4m 100%\n- 4m 55%",
      },
    ];
    const client = createMockClient(returnedEvents);

    const result = await createWorkout(client, {
      name: "Threshold Intervals",
      date: "2024-03-30",
      sportType: "Ride",
      steps: [
        { label: "Warmup", duration: "10m", target: "60%" },
        {
          iterations: 3,
          steps: [
            { duration: "4m", target: "100%" },
            { duration: "4m", target: "55%" },
          ],
        },
      ],
    });

    const parsed = result;
    expect(parsed.success).toBe(true);
    expect(parsed.created).toBe(1);
    expect(parsed.events[0].name).toBe("Threshold Intervals");

    expect(client.events.createEvents).toHaveBeenCalledWith([
      expect.objectContaining({
        category: "WORKOUT",
        type: "Ride",
        name: "Threshold Intervals",
        start_date_local: "2024-03-30T00:00:00",
        description: expect.stringContaining("- Warmup 10m 60%"),
      }),
    ]);
  });

  it("passes through externalId and color", async () => {
    const client = createMockClient([
      {
        id: 1,
        category: "WORKOUT",
        start_date_local: "2024-01-01T00:00:00",
        type: "Run",
        name: "Easy Run",
        description: "- 30m Z2",
      },
    ]);

    await createWorkout(client, {
      name: "Easy Run",
      date: "2024-01-01",
      sportType: "Run",
      steps: [{ duration: "30m", target: "Z2" }],
      externalId: "custom-123",
      color: "blue",
    });

    expect(client.events.createEvents).toHaveBeenCalledWith([
      expect.objectContaining({
        external_id: "custom-123",
        color: "blue",
      }),
    ]);
  });
});

describe("createStrengthWorkout tool handler", () => {
  it("creates a WeightTraining event with free-form description", async () => {
    const returnedEvents: IntervalsEvent[] = [
      {
        id: 99,
        category: "WORKOUT",
        start_date_local: "2024-04-01T00:00:00",
        type: "WeightTraining",
        name: "Strength Session",
        description: "Box Squat 3×5 @ RPE 7\nTrap Bar Deadlift 3×5 @ RPE 8",
      },
    ];
    const client = createMockClient(returnedEvents);

    const result = await createStrengthWorkout(client, {
      name: "Strength Session",
      date: "2024-04-01",
      description: "Box Squat 3×5 @ RPE 7\nTrap Bar Deadlift 3×5 @ RPE 8",
    });

    const parsed = result;
    expect(parsed.success).toBe(true);
    expect(parsed.created).toBe(1);
    expect(parsed.events[0].name).toBe("Strength Session");
    expect(parsed.events[0].description).toContain("Box Squat");

    expect(client.events.createEvents).toHaveBeenCalledWith([
      expect.objectContaining({
        category: "WORKOUT",
        type: "WeightTraining",
        name: "Strength Session",
        start_date_local: "2024-04-01T00:00:00",
        description: "Box Squat 3×5 @ RPE 7\nTrap Bar Deadlift 3×5 @ RPE 8",
        external_id: "mcp-2024-04-01-strength-session",
      }),
    ]);
  });

  it("passes through externalId and color", async () => {
    const client = createMockClient([
      {
        id: 1,
        category: "WORKOUT",
        start_date_local: "2024-04-01T00:00:00",
        type: "WeightTraining",
        name: "Gym",
        description: "Squats 3×5",
      },
    ]);

    await createStrengthWorkout(client, {
      name: "Gym",
      date: "2024-04-01",
      description: "Squats 3×5",
      externalId: "gym-123",
      color: "red",
    });

    expect(client.events.createEvents).toHaveBeenCalledWith([
      expect.objectContaining({
        external_id: "gym-123",
        color: "red",
      }),
    ]);
  });
});

describe("createWorkout notes", () => {
  it("emits notes above the step lines", async () => {
    const client = createMockClient();
    await createWorkout(client, {
      name: "Recovery",
      date: "2026-09-20",
      sportType: "Ride",
      notes: "Circulation, not stimulus.",
      steps: [{ label: "Easy", duration: "40m", target: "125w-165w" }],
    });
    expect(client.events.createEvents).toHaveBeenCalledWith([
      expect.objectContaining({
        description: "Circulation, not stimulus.\n\n- Easy 40m 125w-165w",
      }),
    ]);
  });
});

describe("scheduleLibraryWorkout", () => {
  it("copies the library description verbatim, prose and trailer included", async () => {
    const description =
      "Circulation, not stimulus.\n\n- Easy 40m 125w-165w 95rpm\n\n<!-- template: recovery-spin -->";
    const client = {
      workoutLibrary: {
        get: vi.fn().mockResolvedValue({
          workout: { id: 15, name: "Recovery spin", type: "Ride", description },
        }),
      },
      events: { createEvents: vi.fn().mockResolvedValue([]) },
    } as unknown as IIntervalsClient;

    await scheduleLibraryWorkout(client, { id: 15, date: "2026-09-20" });

    expect(client.events.createEvents).toHaveBeenCalledWith([
      {
        category: "WORKOUT",
        start_date_local: "2026-09-20T00:00:00",
        type: "Ride",
        name: "Recovery spin",
        description,
        external_id: "mcp-2026-09-20-recovery-spin",
      },
    ]);
  });
});

describe("createWorkout — the unreviewable-step warning", () => {
  it("reads FTP from the athlete anchors, and warns on an unlabelled hard step", async () => {
    const client = {
      ...createMockClient(),
      anchors: {
        getAthleteAnchors: vi
          .fn()
          .mockResolvedValue({ ftp: 300, weight: 70, powerZones: null }),
      },
    } as unknown as IIntervalsClient;

    const result = await createWorkout(client, {
      name: "Threshold",
      date: "2024-03-30",
      sportType: "Ride",
      steps: [
        { label: "Warmup", duration: "10m", target: "60%" },
        { label: "Hard bit", duration: "10m", target: "100%" },
      ],
    });

    expect(client.anchors.getAthleteAnchors).toHaveBeenCalledOnce();
    expect(result.unreviewableSteps).toEqual([
      { index: 1, label: "Hard bit", watts: 300 },
    ]);
  });
});

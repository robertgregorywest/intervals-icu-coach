import { describe, it, expect, vi } from "vitest";
import { createPrescription } from "../../../src/services/prescription/index.js";
import { WorkoutLibrary } from "../../../src/services/workout-library/library.js";
import type { IWorkoutLibraryApi } from "../../../src/services/workout-library/api.js";
import { createWorkoutParser } from "../../../src/services/workout-parser/index.js";

function fakeApi(
  overrides: Partial<IWorkoutLibraryApi> = {}
): IWorkoutLibraryApi {
  return {
    listFolders: vi.fn().mockResolvedValue([]),
    getWorkout: vi.fn(),
    createFolder: vi.fn(),
    createWorkout: vi.fn(),
    updateWorkout: vi.fn(),
    deleteWorkout: vi.fn(),
    deleteFolder: vi.fn(),
    ...overrides,
  };
}

const workoutParser = createWorkoutParser();
const prescription = createPrescription({ workoutParser });

describe("WorkoutLibrary.list", () => {
  it("walks the children tree and summarizes each workout", async () => {
    const api = fakeApi({
      listFolders: vi.fn().mockResolvedValue([
        {
          id: 1,
          name: "Coach Templates",
          type: "FOLDER",
          children: [
            {
              id: 10,
              name: "VO2 4x4",
              type: "Ride",
              description: "4x\n- 4m 110%\n- 4m 50%",
            },
            {
              id: 11,
              name: "Z2",
              type: "Ride",
              description: "- 1h 60%",
            },
          ],
        },
        {
          id: 2,
          name: "Other",
          type: "FOLDER",
          children: [
            {
              id: 20,
              name: "Long ride",
              type: "Ride",
              description: "- 3h 60%",
            },
          ],
        },
      ]),
    });
    const lib = new WorkoutLibrary(api, { prescription, workoutParser });

    const result = await lib.list();

    expect(result.folders).toEqual([
      { id: 1, name: "Coach Templates", num_workouts: 2 },
      { id: 2, name: "Other", num_workouts: 1 },
    ]);
    expect(result.workouts).toHaveLength(3);
    const vo2 = result.workouts.find((w) => w.name === "VO2 4x4");
    expect(vo2?.stepCount).toBe(8);
    expect(vo2?.folder_id).toBe(1);
    expect(vo2?.folder_name).toBe("Coach Templates");
    expect(vo2?.type).toBe("Ride");
  });

  it("recurses into nested folders within children", async () => {
    const api = fakeApi({
      listFolders: vi.fn().mockResolvedValue([
        {
          id: 1,
          name: "Top",
          type: "FOLDER",
          children: [
            {
              id: 2,
              name: "Inner",
              type: "FOLDER",
              children: [
                {
                  id: 99,
                  name: "Buried",
                  type: "Ride",
                  description: "- 30m 60%",
                },
              ],
            },
          ],
        },
      ]),
    });
    const lib = new WorkoutLibrary(api, { prescription, workoutParser });
    const result = await lib.list();
    expect(result.workouts).toHaveLength(1);
    expect(result.workouts[0].name).toBe("Buried");
    expect(result.folders[0].num_workouts).toBe(1);
  });

  it("filters by folder name", async () => {
    const api = fakeApi({
      listFolders: vi.fn().mockResolvedValue([
        {
          id: 1,
          name: "Coach Templates",
          type: "FOLDER",
          children: [
            {
              id: 10,
              name: "VO2 4x4",
              type: "Ride",
              description: "- 4m 110%",
            },
          ],
        },
        {
          id: 2,
          name: "Other",
          type: "FOLDER",
          children: [
            { id: 20, name: "Long", type: "Ride", description: "- 3h 60%" },
          ],
        },
      ]),
    });
    const lib = new WorkoutLibrary(api, { prescription, workoutParser });

    const result = await lib.list("Coach Templates");

    expect(result.folders).toHaveLength(1);
    expect(result.workouts).toHaveLength(1);
    expect(result.workouts[0].name).toBe("VO2 4x4");
  });

  it("handles folders with no children array", async () => {
    const api = fakeApi({
      listFolders: vi
        .fn()
        .mockResolvedValue([{ id: 1, name: "Empty", type: "FOLDER" }]),
    });
    const lib = new WorkoutLibrary(api, { prescription, workoutParser });
    const result = await lib.list();
    expect(result.workouts).toHaveLength(0);
    expect(result.folders[0].num_workouts).toBe(0);
  });
});

describe("WorkoutLibrary.get", () => {
  it("returns workout, stripped description, seedId, and summary", async () => {
    const description = "- 4m 360w\n- 4m 180w\n\n<!-- template: vo2-4x4 -->";
    const api = fakeApi({
      getWorkout: vi.fn().mockResolvedValue({
        id: 42,
        name: "VO2 4x4",
        type: "Ride",
        description,
      }),
    });
    const lib = new WorkoutLibrary(api, { prescription, workoutParser });

    const item = await lib.get(42);

    expect(item.workout.id).toBe(42);
    expect(item.description_text).toBe("- 4m 360w\n- 4m 180w");
    expect(item.seedId).toBe("vo2-4x4");
    expect(item.summary.stepCount).toBe(2);
  });

  it("returns null seedId when nothing manages the workout", async () => {
    const api = fakeApi({
      getWorkout: vi.fn().mockResolvedValue({
        id: 1,
        name: "Plain",
        type: "Ride",
        description: "- 30m 75%",
      }),
    });
    const lib = new WorkoutLibrary(api, { prescription, workoutParser });
    const item = await lib.get(1);
    expect(item.seedId).toBeNull();
  });
});

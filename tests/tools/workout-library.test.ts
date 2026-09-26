import { describe, it, expect, vi } from "vitest";
import {
  listWorkoutLibraryTool,
  getWorkoutLibraryItemTool,
  syncWorkoutLibraryTool,
  deleteWorkoutLibraryItemTool,
} from "../../src/tools/workout-library.js";

const listWorkoutLibrary = listWorkoutLibraryTool.handler;
const getWorkoutLibraryItem = getWorkoutLibraryItemTool.handler;
const syncWorkoutLibrary = syncWorkoutLibraryTool.handler;
const deleteWorkoutLibraryItem = deleteWorkoutLibraryItemTool.handler;
import type { IIntervalsClient } from "../../src/index.js";

function createMockClient(): IIntervalsClient {
  const workoutLibrary = {
    list: vi.fn().mockResolvedValue({
      folders: [{ id: 1, name: "Coach: VO2 Max", num_workouts: 1 }],
      workouts: [
        {
          id: 10,
          name: "VO2 4x4",
          type: "Ride",
          folder_id: 1,
          folder_name: "Coach: VO2 Max",
          stepCount: 8,
          totalSeconds: 1920,
          hasTemplate: true,
          purpose: "Default VO2 session.",
          oneLine: "8 steps, 32m",
        },
      ],
    }),
    get: vi.fn().mockResolvedValue({
      workout: { id: 10, name: "VO2 4x4", description: "..." },
      description_text: "...",
      seedId: "vo2-4x4",
      summary: {
        stepCount: 8,
        totalSeconds: 1920,
        hasTemplate: true,
        oneLine: "8 steps, 32m",
      },
    }),
    delete: vi.fn().mockResolvedValue(undefined),
    sync: vi.fn().mockResolvedValue({
      dryRun: true,
      created: [{ seedId: "openers", name: "Openers", folder: "Coach: Race" }],
      updated: [
        {
          seedId: "vo2-4x4",
          name: "VO2 4×4",
          folder: "Coach: VO2 Max",
          workoutId: 10,
          changed: ["description"],
        },
      ],
      unchanged: [],
      skipped: [],
      orphans: [],
      warnings: [],
    }),
  };
  return { workoutLibrary } as unknown as IIntervalsClient;
}

describe("listWorkoutLibrary handler", () => {
  it("delegates to workoutLibrary.list", async () => {
    const client = createMockClient();
    const result = await listWorkoutLibrary(client, {});
    expect(result.folders).toHaveLength(1);
    expect(result.workouts[0].name).toBe("VO2 4x4");
    expect(client.workoutLibrary.list).toHaveBeenCalledWith(undefined);
  });

  it("surfaces purpose so the coach can select by intent", async () => {
    const client = createMockClient();
    const result = await listWorkoutLibrary(client, {});
    expect(result.workouts[0].purpose).toBe("Default VO2 session.");
    expect(result.workouts[0].hasTemplate).toBe(true);
  });

  it("passes folder filter through", async () => {
    const client = createMockClient();
    await listWorkoutLibrary(client, { folder: "VO2" });
    expect(client.workoutLibrary.list).toHaveBeenCalledWith("VO2");
  });
});

describe("getWorkoutLibraryItem handler", () => {
  it("delegates to workoutLibrary.get", async () => {
    const client = createMockClient();
    const result = (await getWorkoutLibraryItem(client, { id: 10 })) as {
      seedId: string;
    };
    expect(result.seedId).toBe("vo2-4x4");
    expect(client.workoutLibrary.get).toHaveBeenCalledWith(10);
  });
});

describe("syncWorkoutLibrary handler", () => {
  it("forwards anchors and dryRun to workoutLibrary.sync", async () => {
    const client = createMockClient();
    const result = await syncWorkoutLibrary(client, {
      mapWatts: 415,
      ftpWatts: 290,
      dryRun: true,
    });
    expect(result.created).toHaveLength(1);
    expect(result.updated[0].changed).toEqual(["description"]);
    expect(client.workoutLibrary.sync).toHaveBeenCalledWith({
      mapWatts: 415,
      ftpWatts: 290,
      dryRun: true,
    });
  });
});

describe("deleteWorkoutLibraryItem handler", () => {
  it("deletes by id and reports it", async () => {
    const client = createMockClient();
    const result = await deleteWorkoutLibraryItem(client, { id: 10 });
    expect(client.workoutLibrary.delete).toHaveBeenCalledWith(10);
    expect(result).toEqual({ success: true, deleted: 10 });
  });
});

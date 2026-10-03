import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createWorkoutScheduling } from "../../../src/services/workout-scheduling/index.js";
import type { IEventsApi } from "../../../src/services/events/index.js";
import type {
  IWorkoutLibrary,
  LibraryItem,
} from "../../../src/services/workout-library/index.js";
import type { AthleteAnchors } from "../../../src/services/athlete-anchors/index.js";
import { createPrescription } from "../../../src/services/prescription/index.js";
import { createWorkoutParser } from "../../../src/services/workout-parser/index.js";
import type { IntervalsEvent } from "../../../src/types.js";
import { pinnedAnchors } from "../../helpers/anchors.js";
import { stubEventsApi } from "../../helpers/stub-events-api.js";

const workoutParser = createWorkoutParser();
const prescription = createPrescription({ workoutParser });

/** A library holding one workout; everything else refuses. */
function libraryWith(workout: LibraryItem["workout"]): IWorkoutLibrary {
  const unused = async (): Promise<never> => {
    throw new Error("library: not stubbed");
  };
  return {
    list: unused,
    sync: unused,
    delete: unused,
    get: async (id) => {
      if (id !== workout.id) throw new Error(`no library workout ${id}`);
      return { workout } as LibraryItem;
    },
  };
}

/** The scheduling module over a fake calendar; no FTP unless a test pins one. */
function setup(
  opts: {
    events?: Partial<IEventsApi>;
    athlete?: () => Promise<Partial<AthleteAnchors>>;
    library?: IWorkoutLibrary;
  } = {}
) {
  const createEvents = vi.fn(async (events: IntervalsEvent[]) => events);
  const updateEvent = vi.fn(
    async (id: number, data: Partial<IntervalsEvent>) =>
      ({ id, ...data }) as IntervalsEvent
  );
  const eventsApi = stubEventsApi({
    createEvents,
    updateEvent,
    ...opts.events,
  });
  const athlete = vi.fn(opts.athlete ?? (async () => ({})));
  const scheduling = createWorkoutScheduling({
    eventsApi,
    workoutLibrary: opts.library ?? libraryWith({} as LibraryItem["workout"]),
    anchors: pinnedAnchors({ athlete }),
    prescription,
    workoutParser,
  });
  return { scheduling, createEvents, updateEvent, athlete };
}

describe("schedulePlan", () => {
  it("writes the built WORKOUT event and returns what the calendar kept", async () => {
    const { scheduling, createEvents } = setup();

    const { events } = await scheduling.schedulePlan({
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

    expect(createEvents).toHaveBeenCalledWith([
      expect.objectContaining({
        category: "WORKOUT",
        type: "Ride",
        name: "Threshold Intervals",
        start_date_local: "2024-03-30T00:00:00",
        description: expect.stringContaining("- Warmup 10m 60%"),
      }),
    ]);
    expect(events).toHaveLength(1);
  });

  it("emits notes above the step lines, and passes externalId and color", async () => {
    const { scheduling, createEvents } = setup();
    await scheduling.schedulePlan({
      name: "Recovery",
      date: "2026-09-20",
      sportType: "Ride",
      notes: "Circulation, not stimulus.",
      steps: [{ label: "Easy", duration: "40m", target: "125w-165w" }],
      externalId: "custom-123",
      color: "blue",
    });
    expect(createEvents).toHaveBeenCalledWith([
      expect.objectContaining({
        description: "Circulation, not stimulus.\n\n- Easy 40m 125w-165w",
        external_id: "custom-123",
        color: "blue",
      }),
    ]);
  });

  it("refuses a step label the platform would cut short, before writing", async () => {
    const { scheduling, createEvents } = setup();
    await expect(
      scheduling.schedulePlan({
        name: "MAP",
        date: "2026-09-20",
        sportType: "Ride",
        steps: [{ label: "MAP — best 60s", duration: "1m", target: "400w" }],
      })
    ).rejects.toThrow(/contains "60s"/);
    expect(createEvents).not.toHaveBeenCalled();
  });
});

describe("scheduleLibraryWorkout", () => {
  it("copies the library description verbatim, prose and trailer included", async () => {
    const description =
      "Circulation, not stimulus.\n\n- Easy 40m 125w-165w 95rpm\n\n<!-- template: recovery-spin -->";
    const { scheduling, createEvents } = setup({
      library: libraryWith({
        id: 15,
        name: "Recovery spin",
        type: "Ride",
        description,
      } as LibraryItem["workout"]),
    });

    await scheduling.scheduleLibraryWorkout({ id: 15, date: "2026-09-20" });

    expect(createEvents).toHaveBeenCalledWith([
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

  it("warns on an unlabelled hard step in the library text", async () => {
    const { scheduling } = setup({
      athlete: async () => ({ ftp: 300 }),
      library: libraryWith({
        id: 7,
        name: "Old threshold",
        type: "Ride",
        description: "- Warmup 10m 60%\n\n- Hard bit 10m 100%",
      } as LibraryItem["workout"]),
    });

    const result = await scheduling.scheduleLibraryWorkout({
      id: 7,
      date: "2026-09-20",
    });

    expect(result.unreviewableSteps).toEqual([
      { index: 1, label: "Hard bit", watts: 300 },
    ]);
  });
});

/**
 * Round trip through Intervals.icu's server-side reparse (#42).
 *
 * `tests/fixtures/events/scheduled-library-workout.json` is a real capture: the
 * library item "Sweet Spot 3×12" scheduled with `schedule_library_workout`, then
 * re-read with `get_event`. Its `capture` block records the date and event id.
 * The fake-calendar test above only sees the POST body; this sees what the
 * platform kept.
 *
 * To refresh (writes to the live calendar, so by hand):
 *   1. ./bin/icu get_workout_library_item --json '{"id":12}'   # libraryDescription
 *   2. ./bin/icu schedule_library_workout --json '{"id":12,"date":"<spare future date>"}' --yes
 *   3. ./bin/icu get_event --json '{"id":<event id>}'          # event
 *   4. ./bin/icu delete_events --json '{"ids":[{"id":<event id>}]}' --yes
 *   5. Keep only id, start_date_local, type, category, name, description,
 *      moving_time, external_id and workout_doc.{steps,duration,distance};
 *      update `capture`. If a test fails after recapturing, the platform's
 *      parsing changed.
 */
describe("scheduleLibraryWorkout — round trip through Intervals.icu", () => {
  const { libraryDescription, event } = JSON.parse(
    readFileSync(
      fileURLToPath(
        new URL(
          "../../fixtures/events/scheduled-library-workout.json",
          import.meta.url
        )
      ),
      "utf8"
    )
  );

  it("keeps the description — notes, steps and trailer — verbatim", () => {
    expect(event.description).toBe(libraryDescription);
    expect(event.description).toContain("Hold cadence ≥ 85 on the reps.");
    expect(event.description).toContain("<!-- template: sweet-spot-3x12 -->");
  });

  it("parses workout_doc.steps to the expected labels, durations and targets", () => {
    const [warmup, block, cooldown] = event.workout_doc.steps;
    expect(event.workout_doc.steps).toHaveLength(3);
    expect(event.workout_doc.duration).toBe(4200);
    expect(warmup).toMatchObject({
      text: "Warm-up",
      duration: 720,
      power: { start: 155, end: 200, units: "w" },
    });
    expect(block.reps).toBe(3);
    expect(block.steps).toMatchObject([
      {
        text: "SST",
        duration: 720,
        power: { start: 88, end: 94, units: "%ftp" },
      },
      { text: "Recovery", duration: 240, power: { value: 155, units: "w" } },
    ]);
    expect(cooldown).toMatchObject({
      text: "Cooldown",
      duration: 600,
      power: { value: 145, units: "w" },
    });
  });

  it("reads back through the prescription with every label intact", () => {
    const read = prescription.read(event.workout_doc, { ftp: 300 });
    expect(read.steps.map((s) => s.label)).toEqual([
      "Warm-up",
      "SST",
      "Recovery",
      "SST",
      "Recovery",
      "SST",
      "Recovery",
      "Cooldown",
    ]);
    expect(read.totalSeconds).toBe(4200);
  });
});

describe("scheduleStrength", () => {
  it("writes a WeightTraining event with the prose verbatim", async () => {
    const { scheduling, createEvents } = setup();
    const description = "Box Squat 3×5 @ RPE 7\nTrap Bar Deadlift 3×5 @ RPE 8";

    const result = await scheduling.scheduleStrength({
      name: "Strength Session",
      date: "2024-04-01",
      description,
    });

    expect(createEvents).toHaveBeenCalledWith([
      expect.objectContaining({
        category: "WORKOUT",
        type: "WeightTraining",
        name: "Strength Session",
        start_date_local: "2024-04-01T00:00:00",
        description,
        external_id: "mcp-2024-04-01-strength-session",
      }),
    ]);
    expect(result).not.toHaveProperty("unreviewableSteps");
  });

  it("passes through externalId and color", async () => {
    const { scheduling, createEvents } = setup();
    await scheduling.scheduleStrength({
      name: "Gym",
      date: "2024-04-01",
      description: "Squats 3×5",
      externalId: "gym-123",
      color: "red",
    });
    expect(createEvents).toHaveBeenCalledWith([
      expect.objectContaining({ external_id: "gym-123", color: "red" }),
    ]);
  });

  it("never looks up the anchors", async () => {
    const { scheduling, athlete } = setup();
    await scheduling.scheduleStrength({
      name: "Gym",
      date: "2024-04-01",
      description: "Squats 3×5",
    });
    expect(athlete).not.toHaveBeenCalled();
  });
});

describe("the unreviewable-step warning", () => {
  it("reads FTP from the athlete anchors, and warns on an unlabelled hard step", async () => {
    const { scheduling, athlete } = setup({
      athlete: async () => ({ ftp: 300, weight: 70 }),
    });

    const result = await scheduling.schedulePlan({
      name: "Threshold",
      date: "2024-03-30",
      sportType: "Ride",
      steps: [
        { label: "Warmup", duration: "10m", target: "60%" },
        { label: "Hard bit", duration: "10m", target: "100%" },
      ],
    });

    expect(athlete).toHaveBeenCalledOnce();
    expect(result.unreviewableSteps).toEqual([
      { index: 1, label: "Hard bit", watts: 300 },
    ]);
  });

  it("is absent when every hard step declares its work role", async () => {
    const { scheduling } = setup({ athlete: async () => ({ ftp: 300 }) });
    const result = await scheduling.schedulePlan({
      name: "Threshold",
      date: "2024-03-30",
      sportType: "Ride",
      steps: [{ label: "Threshold", duration: "10m", target: "100%" }],
    });
    expect(result).not.toHaveProperty("unreviewableSteps");
  });

  it("is best-effort: the workout is written with no warning when the anchors lookup throws", async () => {
    const { scheduling, createEvents } = setup({
      athlete: async () => {
        throw new Error("down");
      },
    });

    const result = await scheduling.schedulePlan({
      name: "Threshold",
      date: "2024-03-30",
      sportType: "Ride",
      steps: [{ label: "Hard bit", duration: "10m", target: "300w" }],
    });

    expect(createEvents).toHaveBeenCalledOnce();
    expect(result).not.toHaveProperty("unreviewableSteps");
  });
});

describe("updateEvent — the structure guard", () => {
  const structuredWorkout = (description: string) =>
    ({
      id: 1,
      category: "WORKOUT",
      name: "Original",
      description,
      workout_doc: { steps: [{ duration: 600 }] },
    }) as IntervalsEvent;

  it("writes metadata without fetching the existing event", async () => {
    const getEvent = vi.fn();
    const { scheduling, updateEvent } = setup({ events: { getEvent } });

    await scheduling.updateEvent(1, { name: "Renamed", color: "#abc" });

    expect(getEvent).not.toHaveBeenCalled();
    expect(updateEvent).toHaveBeenCalledWith(1, {
      name: "Renamed",
      color: "#abc",
    });
  });

  it("converts date to start_date_local", async () => {
    const { scheduling, updateEvent } = setup();
    await scheduling.updateEvent(1, { date: "2024-02-15" });
    expect(updateEvent).toHaveBeenCalledWith(1, {
      start_date_local: "2024-02-15T00:00:00",
    });
  });

  it("rebuilds the description from steps without fetching (issue #1)", async () => {
    const getEvent = vi.fn();
    const { scheduling, updateEvent } = setup({ events: { getEvent } });

    await scheduling.updateEvent(1, {
      name: "Long Z2 2.5h",
      steps: [
        { label: "Warmup", duration: "10m", target: "150w" },
        { label: "Main", duration: "5m", target: "240w" },
      ],
    });

    expect(updateEvent).toHaveBeenCalledWith(1, {
      name: "Long Z2 2.5h",
      description: "- Warmup 10m 150w\n\n- Main 5m 240w",
    });
    expect(getEvent).not.toHaveBeenCalled();
  });

  it("puts notes above the rebuilt step lines", async () => {
    const { scheduling, updateEvent } = setup();
    await scheduling.updateEvent(1, {
      steps: [{ duration: "10m", target: "150w" }],
      notes: "Easy day.",
    });
    expect(updateEvent).toHaveBeenCalledWith(1, {
      description: "Easy day.\n\n- 10m 150w",
    });
  });

  it("refuses steps and description together", async () => {
    const { scheduling, updateEvent } = setup();
    await expect(
      scheduling.updateEvent(1, {
        steps: [{ duration: "10m", target: "150w" }],
        description: "some prose",
      })
    ).rejects.toThrow(/mutually exclusive/i);
    expect(updateEvent).not.toHaveBeenCalled();
  });

  it("refuses notes without steps", async () => {
    const { scheduling, updateEvent } = setup();
    await expect(
      scheduling.updateEvent(1, { notes: "Easy day." })
    ).rejects.toThrow(/'notes' requires 'steps'/);
    expect(updateEvent).not.toHaveBeenCalled();
  });

  it("refuses a description with no step lines on a structured WORKOUT (issue #1)", async () => {
    const { scheduling, updateEvent } = setup({
      events: { getEvent: async () => structuredWorkout("- 10m 60%") },
    });
    await expect(
      scheduling.updateEvent(1, {
        name: "Renamed",
        description: "some notes with no step lines",
      })
    ).rejects.toThrow(/refusing to update 'description' on a WORKOUT event/);
    expect(updateEvent).not.toHaveBeenCalled();
  });

  it("accepts prose plus step lines on a structured WORKOUT", async () => {
    const { scheduling, updateEvent } = setup({
      events: { getEvent: async () => structuredWorkout("- 40m 125w") },
    });
    const description = "Circulation, not stimulus.\n\n- Easy 40m 125w-165w";
    await scheduling.updateEvent(1, { description });
    expect(updateEvent).toHaveBeenCalledWith(1, { description });
  });

  it("accepts a prose-only description on a non-WORKOUT event", async () => {
    const { scheduling, updateEvent } = setup({
      events: {
        getEvent: async () =>
          ({
            id: 1,
            category: "NOTE",
            name: "Original",
            description: "old prose",
          }) as IntervalsEvent,
      },
    });
    await scheduling.updateEvent(1, { description: "new prose" });
    expect(updateEvent).toHaveBeenCalledWith(1, { description: "new prose" });
  });

  it("refuses a step label the platform would cut short", async () => {
    const { scheduling, updateEvent } = setup();
    await expect(
      scheduling.updateEvent(1, {
        steps: [{ label: "Easy Z2 spin", duration: "45m", target: "180w" }],
      })
    ).rejects.toThrow(/contains "Z2"/);
    expect(updateEvent).not.toHaveBeenCalled();
  });
});

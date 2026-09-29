import { describe, it, expect, vi } from "vitest";
import { createPrescription } from "../../src/services/prescription/index.js";
import {
  getEventsTool,
  getEventTool,
  updateEventTool,
  deleteEventsTool,
} from "../../src/tools/events.js";
import type { IServices } from "../../src/index.js";
import type { IEventsApi } from "../../src/services/events/index.js";
import { createWorkoutScheduling } from "../../src/services/workout-scheduling/index.js";
import type { IWorkoutLibrary } from "../../src/services/workout-library/index.js";
import type { IAthleteAnchors } from "../../src/services/athlete-anchors/index.js";
import { createWorkoutParser } from "../../src/services/workout-parser/index.js";

const getEvents = getEventsTool.handler;
const getEvent = getEventTool.handler;
const updateEvent = updateEventTool.handler;
const deleteEvents = deleteEventsTool.handler;

function createMockServices(overrides: Partial<IEventsApi> = {}): IServices {
  const events = {
    getEvents: vi
      .fn()
      .mockResolvedValue([
        { id: 1, name: "Threshold Intervals", category: "WORKOUT" },
      ]),
    getEvent: vi.fn().mockResolvedValue({
      id: 1,
      name: "Threshold Intervals",
      category: "NOTE",
      description: "- 10m 60%",
    }),
    updateEvent: vi.fn().mockResolvedValue({
      id: 1,
      name: "Updated Workout",
    }),
    deleteEvents: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  } as unknown as IEventsApi;
  return {
    events,
    workoutScheduling: createWorkoutScheduling({
      eventsApi: events,
      workoutLibrary: {} as IWorkoutLibrary,
      anchors: {} as IAthleteAnchors,
      prescription: createPrescription({ workoutParser }),
      workoutParser,
    }),
  } as unknown as IServices;
}

const workoutParser = createWorkoutParser();

describe("getEvents tool handler", () => {
  it("returns events as JSON", async () => {
    const services = createMockServices();
    const result = await getEvents(services, {
      oldest: "2024-01-01",
      newest: "2024-01-31",
    });
    const parsed = result;

    expect(parsed.total).toBe(1);
    expect(parsed.count).toBe(1);
    expect(parsed.truncated).toBe(false);
    expect(parsed.events[0].name).toBe("Threshold Intervals");
    expect(services.events.getEvents).toHaveBeenCalledWith(
      "2024-01-01",
      "2024-01-31"
    );
  });
});

describe("getEvent tool handler", () => {
  it("returns single event as JSON", async () => {
    const services = createMockServices();
    const result = await getEvent(services, { id: 1 });

    expect(result).toMatchObject({ description: "- 10m 60%" });
    expect(services.events.getEvent).toHaveBeenCalledWith(1);
  });
});

describe("updateEvent tool handler", () => {
  it("updates event and returns result", async () => {
    const services = createMockServices();
    const result = await updateEvent(services, {
      id: 1,
      name: "Updated Workout",
    });

    expect(result).toMatchObject({ name: "Updated Workout" });
    expect(services.events.updateEvent).toHaveBeenCalledWith(1, {
      name: "Updated Workout",
    });
  });

  it("converts date to start_date_local", async () => {
    const services = createMockServices();
    await updateEvent(services, { id: 1, date: "2024-02-15" });

    expect(services.events.updateEvent).toHaveBeenCalledWith(1, {
      start_date_local: "2024-02-15T00:00:00",
    });
  });

  it("rebuilds description from steps and PUTs (issue #1)", async () => {
    const services = createMockServices();
    await updateEvent(services, {
      id: 1,
      name: "Long Z2 2.5h",
      steps: [
        { label: "Warmup", duration: "10m", target: "150w" },
        { label: "Main", duration: "5m", target: "240w" },
      ],
    });

    expect(services.events.updateEvent).toHaveBeenCalledWith(1, {
      name: "Long Z2 2.5h",
      description: "- Warmup 10m 150w\n\n- Main 5m 240w",
    });
    // safety: did not need to fetch the existing event
    expect(services.events.getEvent).not.toHaveBeenCalled();
  });

  it("rejects when both steps and description are provided", async () => {
    const services = createMockServices();
    await expect(
      updateEvent(services, {
        id: 1,
        steps: [{ duration: "10m", target: "150w" }],
        description: "some prose",
      })
    ).rejects.toThrow(/mutually exclusive/i);
    expect(services.events.updateEvent).not.toHaveBeenCalled();
  });

  it("rejects description-only update on a WORKOUT event (issue #1 guard)", async () => {
    const services = createMockServices({
      getEvent: vi.fn().mockResolvedValue({
        id: 1,
        category: "WORKOUT",
        name: "Original",
        description: "- 10m 60%",
        workout_doc: { steps: [{ duration: 600 }] },
      }),
    });
    await expect(
      updateEvent(services, {
        id: 1,
        name: "Renamed",
        description: "some notes with no step lines",
      })
    ).rejects.toThrow(/refusing to update 'description' on a WORKOUT event/);
    expect(services.events.updateEvent).not.toHaveBeenCalled();
  });

  it("allows prose plus step lines on a WORKOUT event", async () => {
    const services = createMockServices({
      getEvent: vi.fn().mockResolvedValue({
        id: 1,
        category: "WORKOUT",
        name: "Original",
        description: "- 40m 125w",
        workout_doc: { steps: [{ duration: 2400 }] },
      }),
    });
    const description = "Circulation, not stimulus.\n\n- Easy 40m 125w-165w";
    await updateEvent(services, { id: 1, description });
    expect(services.events.updateEvent).toHaveBeenCalledWith(1, {
      description,
    });
  });

  it("passes notes through to the description rebuild", async () => {
    const services = createMockServices();
    await updateEvent(services, {
      id: 1,
      steps: [{ duration: "10m", target: "150w" }],
      notes: "Easy day.",
    });
    expect(services.events.updateEvent).toHaveBeenCalledWith(1, {
      description: "Easy day.\n\n- 10m 150w",
    });
  });

  it("rejects notes without steps", async () => {
    const services = createMockServices();
    await expect(
      updateEvent(services, { id: 1, notes: "Easy day." })
    ).rejects.toThrow(/'notes' requires 'steps'/);
  });

  it("allows description-only update on a non-WORKOUT event (NOTE)", async () => {
    const services = createMockServices({
      getEvent: vi.fn().mockResolvedValue({
        id: 1,
        category: "NOTE",
        name: "Original",
        description: "old prose",
      }),
    });
    await updateEvent(services, { id: 1, description: "new prose" });

    expect(services.events.updateEvent).toHaveBeenCalledWith(1, {
      description: "new prose",
    });
  });

  it("metadata-only update does not fetch the existing event (no extra round-trip)", async () => {
    const services = createMockServices();
    await updateEvent(services, { id: 1, name: "Renamed", color: "#abc" });

    expect(services.events.getEvent).not.toHaveBeenCalled();
    expect(services.events.updateEvent).toHaveBeenCalledWith(1, {
      name: "Renamed",
      color: "#abc",
    });
  });
});

describe("deleteEvents tool handler", () => {
  it("deletes events and returns success", async () => {
    const services = createMockServices();
    const result = await deleteEvents(services, {
      ids: [{ id: 1 }, { external_id: "test-2" }],
    });
    const parsed = result;

    expect(parsed.success).toBe(true);
    expect(parsed.deleted).toBe(2);
    expect(services.events.deleteEvents).toHaveBeenCalledWith([
      { id: 1 },
      { external_id: "test-2" },
    ]);
  });
});

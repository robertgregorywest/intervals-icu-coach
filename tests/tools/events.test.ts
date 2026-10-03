import { describe, it, expect, vi } from "vitest";
import {
  getEventsTool,
  getEventTool,
  updateEventTool,
  deleteEventsTool,
} from "../../src/tools/events.js";
import type { IServices } from "../../src/index.js";
import type { IEventsApi } from "../../src/services/events/index.js";
import type { IWorkoutScheduling } from "../../src/services/workout-scheduling/index.js";
import type { IntervalsEvent } from "../../src/types.js";
import { stubEventsApi } from "../helpers/stub-events-api.js";
import { stubWorkoutScheduling } from "../helpers/stub-workout-scheduling.js";

const getEvents = getEventsTool.handler;
const getEvent = getEventTool.handler;
const updateEvent = updateEventTool.handler;
const deleteEvents = deleteEventsTool.handler;

function servicesWith(
  events: Partial<IEventsApi>,
  workoutScheduling: Partial<IWorkoutScheduling> = {}
): IServices {
  return {
    events: stubEventsApi(events),
    workoutScheduling: stubWorkoutScheduling(workoutScheduling),
  } as unknown as IServices;
}

describe("getEvents tool handler", () => {
  it("returns events as JSON", async () => {
    const getEventsApi = vi.fn(
      async () =>
        [
          { id: 1, name: "Threshold Intervals", category: "WORKOUT" },
        ] as IntervalsEvent[]
    );
    const result = await getEvents(servicesWith({ getEvents: getEventsApi }), {
      oldest: "2024-01-01",
      newest: "2024-01-31",
    });

    expect(result.total).toBe(1);
    expect(result.count).toBe(1);
    expect(result.truncated).toBe(false);
    expect(result.events[0].name).toBe("Threshold Intervals");
    expect(getEventsApi).toHaveBeenCalledWith("2024-01-01", "2024-01-31");
  });
});

describe("getEvent tool handler", () => {
  it("returns single event as JSON", async () => {
    const getEventApi = vi.fn(
      async () => ({ id: 1, description: "- 10m 60%" }) as IntervalsEvent
    );
    const result = await getEvent(servicesWith({ getEvent: getEventApi }), {
      id: 1,
    });

    expect(result).toMatchObject({ description: "- 10m 60%" });
    expect(getEventApi).toHaveBeenCalledWith(1);
  });
});

describe("updateEvent tool handler", () => {
  it("hands the id and changes to workoutScheduling.updateEvent", async () => {
    const updated = { id: 1, name: "Updated Workout" } as IntervalsEvent;
    const update = vi.fn(async () => updated);
    const steps = [{ duration: "10m", target: "150w" }];

    const result = await updateEvent(
      servicesWith({}, { updateEvent: update }),
      { id: 1, name: "Updated Workout", steps, notes: "Easy day." }
    );

    expect(update).toHaveBeenCalledWith(1, {
      name: "Updated Workout",
      steps,
      notes: "Easy day.",
    });
    expect(result).toBe(updated);
  });
});

describe("deleteEvents tool handler", () => {
  it("deletes events and returns success", async () => {
    const deleteEventsApi = vi.fn(async () => undefined);
    const result = await deleteEvents(
      servicesWith({ deleteEvents: deleteEventsApi }),
      { ids: [{ id: 1 }, { external_id: "test-2" }] }
    );

    expect(result.success).toBe(true);
    expect(result.deleted).toBe(2);
    expect(deleteEventsApi).toHaveBeenCalledWith([
      { id: 1 },
      { external_id: "test-2" },
    ]);
  });
});

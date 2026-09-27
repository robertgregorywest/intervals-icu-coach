import { z } from "zod";
import { defineTool, MUTATING, READ_ONLY } from "./define.js";
import {
  applyLimit,
  assertDateRange,
  dateString,
  limitField,
} from "./common.js";
import { repeatBlockSchema, workoutStepSchema } from "./workouts.js";

const eventCategoryEnum = z.enum([
  "WORKOUT",
  "NOTE",
  "RACE_A",
  "RACE_B",
  "RACE_C",
  "HOLIDAY",
  "SICK",
  "INJURED",
]);

const sportTypeEnum = z.enum([
  "Ride",
  "Run",
  "Swim",
  "VirtualRide",
  "MountainBikeRide",
  "GravelRide",
  "TrailRun",
  "WeightTraining",
  "Yoga",
  "Hike",
  "OpenWaterSwim",
]);

const getEventsSchema = z.object({
  oldest: dateString.describe("Start date in YYYY-MM-DD format"),
  newest: dateString.describe("End date in YYYY-MM-DD format"),
  limit: limitField.optional(),
});

const getEventsOutputSchema = z
  .object({
    total: z.number(),
    count: z.number(),
    truncated: z.boolean(),
    message: z.string().optional(),
    events: z.array(z.object({}).passthrough()),
  })
  .passthrough();

export const getEventsTool = defineTool({
  name: "get_events",
  description:
    "List calendar events (planned workouts, races, notes) in a date range. " +
    "Use this to see what's already scheduled on the athlete's calendar. " +
    "Date range max 365 days; results capped at 'limit' (default 50, max 200). " +
    "Returns: { total, count, truncated, events: [...] }.",
  schema: getEventsSchema,
  annotations: READ_ONLY,
  outputSchema: getEventsOutputSchema,
  async handler(services, args) {
    assertDateRange(args.oldest, args.newest);
    const all = await services.events.getEvents(args.oldest, args.newest);
    const limit = args.limit ?? 50;
    const { items, total, truncated } = applyLimit(all, limit);
    return {
      total,
      count: items.length,
      truncated,
      ...(truncated
        ? {
            message:
              "Result list truncated. Increase 'limit' or narrow the date range.",
          }
        : {}),
      events: items as unknown as Array<Record<string, unknown>>,
    };
  },
});

const getEventSchema = z.object({
  id: z.number().describe("Event ID"),
});

export const getEventTool = defineTool({
  name: "get_event",
  description:
    "Get details of a single calendar event including workout description/structure. " +
    "Returns an IntervalsEvent (id, category, type, name, description, start_date_local).",
  schema: getEventSchema,
  annotations: READ_ONLY,
  outputSchema: null,
  handler: (services, args) => services.events.getEvent(args.id),
});

const updateEventSchema = z.object({
  id: z.number().describe("Event ID to update"),
  name: z.string().optional().describe("Updated event name"),
  description: z
    .string()
    .optional()
    .describe(
      "Updated description. Mutually exclusive with 'steps'. " +
        "On a WORKOUT event whose workout has steps, a description that " +
        "contains no step lines is refused — Intervals.icu reparses it as " +
        "workout-text and would collapse workout_doc.steps. Prose plus step " +
        "lines is accepted. Pass 'steps' (and 'notes') to rebuild structure."
    ),
  steps: z
    .array(z.union([workoutStepSchema, repeatBlockSchema]))
    .min(1)
    .optional()
    .describe(
      "Updated workout steps (same shape as create_workout). When supplied, " +
        "the description is rebuilt from these so workout_doc.steps is preserved. " +
        "Mutually exclusive with 'description'."
    ),
  notes: z
    .string()
    .optional()
    .describe(
      "Session-level prose emitted above the rebuilt step lines. Requires 'steps'."
    ),
  date: dateString.optional().describe("Updated date in YYYY-MM-DD format"),
  category: eventCategoryEnum.optional().describe("Updated event category"),
  type: sportTypeEnum.optional().describe("Updated sport type"),
  color: z.string().optional().describe("Updated event color"),
});

export const updateEventTool = defineTool({
  name: "update_event",
  description:
    "Update an existing calendar event. Can modify name, description, date, category, type, or color. " +
    "Returns the updated IntervalsEvent.",
  schema: updateEventSchema,
  annotations: MUTATING,
  outputSchema: null,
  handler: (services, { id, ...changes }) =>
    services.workoutScheduling.updateEvent(id, changes),
});

const deleteEventsSchema = z.object({
  ids: z
    .array(
      z.union([
        z.object({ id: z.number().describe("Event ID") }).strict(),
        z.object({ external_id: z.string().describe("External ID") }).strict(),
      ])
    )
    .min(1)
    .describe(
      "Array of identifiers to delete. Each item must be exactly one of " +
        "{ id: number } or { external_id: string }."
    ),
});

const deleteEventsOutputSchema = z.object({
  success: z.literal(true),
  deleted: z.number().describe("Number of identifiers submitted for deletion"),
});

export const deleteEventsTool = defineTool({
  name: "delete_events",
  description:
    "Delete one or more calendar events. Each item must specify exactly one of " +
    "{ id } or { external_id }. Cannot be undone. " +
    "Returns: { success: true, deleted: N }.",
  schema: deleteEventsSchema,
  annotations: MUTATING,
  outputSchema: deleteEventsOutputSchema,
  async handler(services, args) {
    await services.events.deleteEvents(args.ids);
    return { success: true as const, deleted: args.ids.length };
  },
});

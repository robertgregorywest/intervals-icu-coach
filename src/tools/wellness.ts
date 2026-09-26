import { z } from "zod";
import { defineTool, READ_ONLY } from "./define.js";
import {
  applyLimit,
  assertDateRange,
  dateString,
  limitField,
} from "./common.js";

const getWellnessSchema = z.object({
  oldest: dateString.describe("Start date in YYYY-MM-DD format"),
  newest: dateString.describe("End date in YYYY-MM-DD format"),
  limit: limitField.optional(),
});

const getWellnessOutputSchema = z
  .object({
    total: z.number(),
    count: z.number(),
    truncated: z.boolean(),
    message: z.string().optional(),
    records: z.array(z.object({}).passthrough()),
  })
  .passthrough();

export const getWellnessTool = defineTool({
  name: "get_wellness",
  description:
    "Get wellness data for a date range including CTL (fitness), ATL (fatigue), " +
    "weight, resting HR, HRV, sleep, and subjective metrics (fatigue, mood, motivation). " +
    "Use this to understand training load trends and recovery status. " +
    "Date range max 365 days; results capped at 'limit' (default 50, max 200). " +
    "Returns: { total, count, truncated, records: [...] }.",
  schema: getWellnessSchema,
  annotations: READ_ONLY,
  outputSchema: getWellnessOutputSchema,
  async handler(client, args) {
    assertDateRange(args.oldest, args.newest);
    const all = await client.wellness.getWellness(args.oldest, args.newest);
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
      records: items as Array<Record<string, unknown>>,
    };
  },
});

export const getFitnessSummaryTool = defineTool({
  name: "get_fitness_summary",
  description:
    "Get today's fitness snapshot — current CTL (fitness), ATL (fatigue), TSB (form), " +
    "HRV, sleep, and subjective metrics. Quick way to assess current readiness. " +
    "Returns a WellnessRecord (ctl, atl, rampRate, restingHR, hrv, sleepSecs, readiness, ...).",
  schema: z.object({}),
  annotations: READ_ONLY,
  outputSchema: null,
  handler: (client) => client.wellness.getWellnessDay(client.today()),
});

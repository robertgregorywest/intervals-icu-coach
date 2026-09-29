import { z } from "zod";
import { activityIdField, idOut } from "./common.js";
import { defineTool, READ_ONLY } from "./define.js";

const getAerobicDecouplingSchema = z.object({
  activityId: activityIdField.describe(
    'Activity ID (e.g. "i151827252" from get_activities, or bare number)'
  ),
});

const decouplingHalfShape = z.object({
  avgPower: z.number(),
  avgHR: z.number(),
  hrPowerRatio: z.number(),
});

const getAerobicDecouplingOutputSchema = z.object({
  firstHalf: decouplingHalfShape,
  secondHalf: decouplingHalfShape,
  decouplingPercent: z.number(),
  interpretation: z.string(),
});

const compareIntervalsSchema = z.object({
  activityIds: z
    .array(activityIdField)
    .describe(
      "Activity IDs to compare intervals across " +
        '(e.g. ["i151827252", "i151543822"] from get_activities)'
    ),
  minPower: z
    .number()
    .optional()
    .describe("Minimum average power (watts) to include an interval"),
  targetDuration: z
    .number()
    .optional()
    .describe(
      "Target interval duration in seconds — filters to matching intervals"
    ),
  durationTolerance: z
    .number()
    .optional()
    .describe(
      "Tolerance for duration filter as a fraction (default: 0.2 = ±20%)"
    ),
});

const intervalValueShape = z.object({
  activityId: idOut,
  name: z.string().optional(),
  date: z.string().optional(),
  avg_watts: z.number().optional(),
  max_watts: z.number().optional(),
  avg_hr: z.number().optional(),
  avg_cadence: z.number().optional(),
  elapsed: z.number().optional(),
});

const intervalSummaryShape = z.object({
  activityId: idOut,
  name: z.string().optional(),
  date: z.string().optional(),
  intervalCount: z.number(),
  avgPower: z.number().nullable(),
  minPower: z.number().nullable(),
  maxPower: z.number().nullable(),
  powerRange: z.number().nullable(),
  avgCadence: z.number().nullable(),
  totalDuration: z.number(),
});

const compareIntervalsOutputSchema = z.object({
  intervals: z.array(
    z.object({
      lapNumber: z.number(),
      values: z.array(intervalValueShape),
    })
  ),
  summaries: z.array(intervalSummaryShape),
});

export const getAerobicDecouplingTool = defineTool({
  name: "get_aerobic_decoupling",
  description:
    "Calculate aerobic decoupling (Pw:Hr ratio) for an activity. " +
    "Compares HR:power ratio between first and second halves of a ride. " +
    "<5% = good aerobic fitness, 5-10% = developing, >10% = needs work. " +
    "Useful for assessing aerobic base fitness from steady-state efforts. " +
    "Returns: { firstHalf, secondHalf, decouplingPercent, interpretation }.",
  schema: getAerobicDecouplingSchema,
  annotations: READ_ONLY,
  outputSchema: getAerobicDecouplingOutputSchema,
  handler: (services, args) =>
    services.analysis.getAerobicDecoupling(args.activityId),
});

export const compareIntervalsTool = defineTool({
  name: "compare_intervals",
  description:
    "Compare intervals across multiple activities side-by-side. " +
    "Shows power, HR, cadence, and duration for each interval. " +
    "Optional filters: minPower (watts), targetDuration (seconds), durationTolerance (fraction). " +
    "Example: targetDuration=300, durationTolerance=0.2 finds all 4-6 minute intervals. " +
    "Useful for tracking interval progression over time. " +
    "Returns: { intervals: [{ lapNumber, values: [...] }], summaries: [...] }.",
  schema: compareIntervalsSchema,
  annotations: READ_ONLY,
  outputSchema: compareIntervalsOutputSchema,
  handler: (services, args) =>
    services.analysis.compareIntervals(args.activityIds, {
      minPower: args.minPower,
      targetDuration: args.targetDuration,
      durationTolerance: args.durationTolerance,
    }),
});

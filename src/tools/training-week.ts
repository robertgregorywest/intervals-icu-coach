import { z } from "zod";
import { defineTool, READ_ONLY } from "./define.js";
import { dateString } from "./common.js";

const getTrainingWeekSummarySchema = z.object({
  weekStart: dateString
    .optional()
    .describe(
      "Start of the week (Monday) in YYYY-MM-DD. Defaults to the current week's Monday."
    ),
});

const fitnessDeltaShape = z
  .object({
    startDate: z.string(),
    endDate: z.string(),
    ctl: z.object({
      start: z.number(),
      end: z.number(),
      delta: z.number(),
    }),
    atl: z.object({
      start: z.number(),
      end: z.number(),
      delta: z.number(),
    }),
    tsb: z.object({
      start: z.number(),
      end: z.number(),
    }),
  })
  .nullable();

const getTrainingWeekSummaryOutputSchema = z.object({
  week: z.object({ start: z.string(), end: z.string() }),
  totals: z.object({
    activityCount: z.number(),
    tss: z.number(),
    durationSeconds: z.number(),
    durationHours: z.number(),
  }),
  middleBand: z
    .object({
      lowPctFtp: z.number(),
      highPctFtp: z.number(),
      lowW: z.number(),
      highW: z.number(),
      seconds: z.number(),
      hours: z.number(),
      fractionOfPowerTime: z.number().nullable(),
    })
    .nullable(),
  bySport: z.record(
    z.object({
      count: z.number(),
      tss: z.number(),
      hours: z.number(),
    })
  ),
  fitness: fitnessDeltaShape,
  completedActivities: z.array(
    z.object({
      id: z.union([z.number(), z.string()]).nullable().optional(),
      date: z.string().nullable().optional(),
      type: z.string().nullable().optional(),
      name: z.string().nullable().optional(),
      source: z.string().nullable().optional(),
      tss: z.number(),
      durationMin: z.number(),
      distanceKm: z.number().nullable(),
      avgWatts: z.number().nullable(),
      avgHr: z.number().nullable(),
      middleBandSeconds: z.number().nullable(),
    })
  ),
  events: z.array(
    z.object({
      id: z.union([z.number(), z.string()]).nullable().optional(),
      date: z.string().nullable().optional(),
      category: z.string().nullable().optional(),
      type: z.string().nullable().optional(),
      name: z.string().nullable().optional(),
    })
  ),
});

export const getTrainingWeekSummaryTool = defineTool({
  name: "get_training_week_summary",
  description:
    "Get a complete training week snapshot in one call: completed activities, " +
    "wellness/fitness trends (CTL/ATL/TSB), and planned events for the upcoming days. " +
    "Provide weekStart (Monday) in YYYY-MM-DD; defaults to current week. " +
    "Use this for weekly review or planning the next week. " +
    "Saves the multi-call dance of get_activities + get_wellness + get_events. " +
    "middleBand is the week's delivered time at 76-106% FTP (tempo through " +
    "threshold), from recorded power streams, with the watt bounds it used; " +
    "null when FTP is unavailable. Each completed activity carries its own " +
    "middleBandSeconds (null without power). " +
    "Returns: { week, totals, middleBand, bySport, fitness: { ctl, atl, tsb }, " +
    "completedActivities: [...], events: [...] }.",
  schema: getTrainingWeekSummarySchema,
  annotations: READ_ONLY,
  outputSchema: getTrainingWeekSummaryOutputSchema,
  handler: (client, args) =>
    client.trainingWeek.getTrainingWeekSummary(args.weekStart),
});

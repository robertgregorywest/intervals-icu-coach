import { z } from "zod";
import {
  compactIntervalAnalysis,
  detectStravaStub,
  packStreams,
} from "./activity-payloads.js";
import { defineTool, READ_ONLY } from "./define.js";
import {
  applyLimit,
  activityIdField,
  assertDateRange,
  dateString,
  limitField,
} from "./common.js";

// Stream payloads scale with activity duration and are unbounded; this budget
// caps the model-facing size by downsampling resolution, not by dropping the tail.
const STREAMS_CHARACTER_BUDGET = 40_000;

// Raw icu_intervals + icu_groups carry ~70 mostly-irrelevant fields per entry
// (weather, smo2, lactate, torque, dfa, wind...) and can dominate the payload to
// the point of overflowing the model's token budget — burying the very structure
// (e.g. "4x 2min") a coach needs. This budget bounds the compacted projection.
const INTERVAL_ANALYSIS_BUDGET = 12_000;

const getActivitiesSchema = z.object({
  oldest: dateString.describe("Start date in YYYY-MM-DD format"),
  newest: dateString.describe("End date in YYYY-MM-DD format"),
  limit: limitField.optional(),
});

const getActivitiesOutputSchema = z
  .object({
    total: z.number().describe("Activities matching the date range"),
    count: z.number().describe("Activities returned (after limit applied)"),
    truncated: z.boolean(),
    message: z.string().optional(),
    activities: z.array(z.object({}).passthrough()),
  })
  .passthrough();

export const getActivitiesTool = defineTool({
  name: "get_activities",
  description:
    "List activities in a date range with summary metrics (TSS, IF, NP, duration, distance, HR, power). " +
    "Use this to review recent training history. " +
    "Date range max 365 days; results capped at 'limit' (default 50, max 200). " +
    "Returns: { total, count, truncated, activities: [...] }.",
  schema: getActivitiesSchema,
  annotations: READ_ONLY,
  outputSchema: getActivitiesOutputSchema,
  async handler(services, args) {
    assertDateRange(args.oldest, args.newest);
    const all = await services.activities.getActivities(
      args.oldest,
      args.newest
    );
    const limit = args.limit ?? 50;
    const { items, total, truncated } = applyLimit(all, limit);
    return {
      total,
      count: items.length,
      truncated,
      ...(truncated
        ? {
            message:
              "Result list truncated by limit. Increase 'limit' or narrow the date range.",
          }
        : {}),
      activities: items as Array<Record<string, unknown>>,
    };
  },
});

const getActivitySchema = z.object({
  id: activityIdField.describe(
    "Activity ID — use the string form returned by get_activities / get_training_week_summary " +
      '(e.g. "i151827252"). Bare numbers are also accepted and will be prefixed automatically. ' +
      "Note: activities synced from Strava cannot be retrieved via the API."
  ),
  includeIntervals: z
    .boolean()
    .optional()
    .describe("Include detected interval analysis (default: false)"),
});

export const getActivityTool = defineTool({
  name: "get_activity",
  description:
    "Get full details for a single activity including metrics, and optionally its laps/intervals. " +
    "Set includeIntervals=true to add a compact interval analysis: " +
    "`intervals[]` (one slim entry per lap: i, type, label, start, dur, avgW, maxW, hr, cadence, grp), " +
    "`groups[]` (laps with the same signature collapsed into one entry — `count` is how many, " +
    "so a 4x2min block appears as one group with count:4; `sig` matches each lap's `grp`), and " +
    '`interval_summary[]` (human strings like "4x 2m 369w" — lossy: average watts and duration only, not an analysis input). ' +
    "These intervals are Intervals.icu's derived, editable segmentation, not the recording; for a race or benchmark effort read get_activity_laps. To find a structured workout's " +
    "efforts, read `groups`/`interval_summary` for the structure, then `intervals` for per-rep detail.",
  schema: getActivitySchema,
  annotations: READ_ONLY,
  outputSchema: null,
  async handler(services, args) {
    const id = args.id;
    const activity = await services.activities.getActivity(
      id,
      args.includeIntervals
    );
    const record = activity as Record<string, unknown>;
    const stub = detectStravaStub(record);
    if (stub) return stub;
    if (args.includeIntervals && Array.isArray(record.icu_intervals)) {
      return compactIntervalAnalysis(record, INTERVAL_ANALYSIS_BUDGET);
    }
    return activity;
  },
});

const getActivityStreamsSchema = z.object({
  id: activityIdField.describe(
    "Activity ID — use the string form returned by get_activities / get_training_week_summary " +
      '(e.g. "i151827252"). Bare numbers are also accepted and will be prefixed automatically. ' +
      "Note: activities synced from Strava have no stream data available."
  ),
  types: z
    .array(z.string())
    .optional()
    .describe(
      'Stream types to fetch, e.g. ["watts", "heartrate", "cadence"]. ' +
        "Strongly recommended — full streams can be very large for long activities."
    ),
});

export const getActivityStreamsTool = defineTool({
  name: "get_activity_streams",
  description:
    "Get raw time-series data for an activity (power, heart rate, cadence, speed, altitude). " +
    "Use types parameter to request specific streams (recommended — fewer streams = full resolution). " +
    'Example: types=["watts", "heartrate"] for a power+HR analysis. ' +
    "Long activities are downsampled by an index stride to fit a size budget, preserving " +
    "whole-ride coverage at lower resolution. " +
    "Returns: { samples, original_samples, downsampled, stride, streams: { watts: number[], ... } }. " +
    "Do NOT derive an effort's window from these streams by power threshold when the athlete lapped it: " +
    "the recorded lap (get_activity_laps) is the effort, a threshold window clips or pads its ends. " +
    "Use the lap's startSeconds/elapsedSeconds to slice these streams on true boundaries.",
  schema: getActivityStreamsSchema,
  annotations: READ_ONLY,
  outputSchema: null,
  async handler(services, args) {
    const id = args.id;
    const streams = await services.activities.getActivityStreams(
      id,
      args.types
    );
    return packStreams(
      streams as unknown as Record<string, unknown>,
      STREAMS_CHARACTER_BUDGET
    );
  },
});

const getActivityLapsSchema = z.object({
  id: getActivityStreamsSchema.shape.id,
});

const getActivityLapsOutputSchema = z.object({
  record: z
    .enum(["device-laps", "absent"])
    .describe(
      "Which record was read: device-laps is the recording; absent means none could be read (nothing is substituted)"
    ),
  note: z.string().optional(),
  count: z.number(),
  laps: z.array(
    z.object({
      index: z.number(),
      startSeconds: z.number().describe("Offset from the first lap's start"),
      elapsedSeconds: z.number(),
      timerSeconds: z.number().optional(),
      distanceMeters: z.number().optional(),
      avgWatts: z.number().optional(),
      npWatts: z.number().optional(),
      maxWatts: z.number().optional(),
      avgHr: z.number().optional(),
      avgCadence: z.number().optional(),
    })
  ),
});

export const getActivityLapsTool = defineTool({
  name: "get_activity_laps",
  description:
    "Get the laps the recording device wrote (decoded from the original FIT upload) — the recorded execution, " +
    "not Intervals.icu's derived icu_intervals. Use this to read a race, time trial or benchmark effort, " +
    "where no planned event exists for compare_planned_vs_actual. " +
    "Per lap: startSeconds (offset from first lap), elapsedSeconds, timerSeconds, distanceMeters, " +
    "avgWatts, npWatts, maxWatts, avgHr, avgCadence. " +
    "Returns: { record: 'device-laps' | 'absent', note?, count, laps: [...] }. " +
    "record 'absent' (e.g. Strava-synced, no FIT file) returns no laps and a reason; nothing derived is substituted.",
  schema: getActivityLapsSchema,
  annotations: READ_ONLY,
  outputSchema: getActivityLapsOutputSchema,
  async handler(services, args) {
    const id = args.id;
    const laps = await services.activities.getActivityLaps(id);
    if (!laps || laps.length === 0) {
      return {
        record: "absent" as const,
        note:
          laps === null
            ? "No device laps could be read: the activity has no original FIT upload (e.g. Strava-synced) or the file is not a readable FIT. " +
              "get_activity with includeIntervals=true gives Intervals.icu's detected intervals, which are derived, not the recording."
            : "The FIT file carries no laps.",
        count: 0,
        laps: [],
      };
    }
    return {
      record: "device-laps" as const,
      ...(laps.length === 1
        ? {
            note: "A single lap: the athlete did not lap this activity, so it records no effort structure.",
          }
        : {}),
      count: laps.length,
      laps: laps.map((lap) => ({
        index: lap.index,
        startSeconds: lap.startTimeSeconds,
        elapsedSeconds: lap.durationSeconds,
        timerSeconds: lap.timerSeconds,
        distanceMeters: lap.distanceMeters,
        avgWatts: lap.averageWatts,
        npWatts: lap.normalizedWatts,
        maxWatts: lap.maxWatts,
        avgHr: lap.averageHeartrate,
        avgCadence: lap.averageCadence,
      })),
    };
  },
});

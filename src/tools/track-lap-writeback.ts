import { z } from "zod";
import { defineTool, DESTRUCTIVE_IDEMPOTENT } from "./define.js";
import { oneSplitsSource, trackInputFields } from "./track-inputs.js";

const writeTrackRunsSchema = z
  .object({
    ...trackInputFields,
    preview: z
      .boolean()
      .optional()
      .describe(
        "Compose the intervals and return them without writing anything. Use this " +
          "first: the write replaces every interval on the activity."
      ),
  })
  .refine(...oneSplitsSource);

const reading = z.object({
  watts: z.number().optional(),
  wattsBand: z.number().optional(),
  cadence: z.number().optional(),
  cadenceBand: z.number().optional(),
  heartrate: z.number().optional(),
  heartrateBand: z.number().optional(),
});

const writeTrackRunsOutputSchema = z.object({
  activityId: z.string(),
  mode: z.enum(["written", "preview"]),
  runs: z.array(
    z.object({
      run: z.string(),
      label: z.string(),
      verdict: z.enum(["strong", "marginal", "weak", "ambiguous"]),
      reason: z.string().optional(),
      startIndex: z.number(),
      endIndex: z.number(),
      fittedStartSeconds: z.number(),
      fittedEndSeconds: z.number(),
      startDriftSeconds: z.number(),
      endDriftSeconds: z.number(),
      fittedReading: reading,
      snappedReading: reading,
    })
  ),
  intervalsReplaced: z.number(),
  intervalsAfterWrite: z.number().optional(),
  notes: z.array(z.string()),
});

export const writeTrackRunsTool = defineTool({
  name: "write_track_runs",
  description:
    "Write a track session's scored runs onto the activity as Intervals.icu " +
    "intervals, so they can be seen on the chart and used by Intervals.icu's own " +
    "interval tools. Takes the same inputs as compute_track_lap_power and runs the " +
    "same alignment. ONE interval per run — first lap's start to last lap's end — " +
    "not one per lap; the run interval excludes the rolling entry, which is the " +
    "boundary Intervals.icu's own detection gets wrong. " +
    "REPLACES every interval already on the activity (the derived analysis is " +
    "discarded, and the count replaced is reported); Intervals.icu backfills the " +
    "stretches between runs with its own, so the activity ends up with more " +
    "intervals than runs. Boundaries are snapped to whole stream samples and the " +
    "drift is reported per run, with the snapped reading beside the fitted one. " +
    "Every placed run is written whatever its verdict; a non-strong fit says so in " +
    "its label, which the next write overwrites (hand edits in the UI do not " +
    "survive). Pass preview: true to see what would be written without writing. " +
    "Returns: { mode, runs: [{ run, label, verdict, startIndex, endIndex, " +
    "startDriftSeconds, endDriftSeconds, fittedReading, snappedReading }], " +
    "intervalsReplaced, intervalsAfterWrite, notes }.",
  schema: writeTrackRunsSchema,
  annotations: DESTRUCTIVE_IDEMPOTENT,
  outputSchema: writeTrackRunsOutputSchema,
  handler: async (services, args) => services.track.write(args),
});

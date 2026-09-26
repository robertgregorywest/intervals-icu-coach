import { z } from "zod";
import { defineTool, READ_ONLY } from "./define.js";
import { resolveTrackInputs, trackInputFields } from "./track-inputs.js";

const computeTrackLapPowerSchema = z.object({ ...trackInputFields });

const reading = z.object({
  watts: z.number().optional(),
  wattsBand: z.number().optional(),
  cadence: z.number().optional(),
  cadenceBand: z.number().optional(),
  heartrate: z.number().optional(),
  heartrateBand: z.number().optional(),
});

const confidence = z.object({
  residualRpm: z.number(),
  offsetIntervalSeconds: z.tuple([z.number(), z.number()]),
  nextBestOffsetSeconds: z.number().optional(),
  nextBestResidualRpm: z.number().optional(),
  residualRatio: z.number().optional(),
  verdict: z.enum(["strong", "marginal", "weak", "ambiguous"]),
  reason: z.string().optional(),
  lapsFitted: z.number(),
  lapsExcluded: z.number(),
});

const computeTrackLapPowerOutputSchema = z.object({
  activityId: z.string(),
  lapDistanceMeters: z.number(),
  samplingIntervalSeconds: z.number(),
  runs: z.array(
    z.object({
      run: z.string(),
      startOffsetSeconds: z.number(),
      durationSeconds: z.number(),
      distanceMeters: z.number(),
      fittedRolloutMeters: z.number(),
      confidence,
      average: reading,
      laps: z
        .array(
          z.object({
            index: z.number(),
            lapTimeSeconds: z.number(),
            startSeconds: z.number(),
            endSeconds: z.number(),
            reading,
          })
        )
        .optional(),
      lapsWithheld: z.string().optional(),
    })
  ),
  rolloutAgreement: z
    .object({
      minMeters: z.number(),
      maxMeters: z.number(),
      spreadPercent: z.number(),
    })
    .optional(),
  thresholds: z.object({
    strongResidualRpm: z.number(),
    marginalResidualRpm: z.number(),
    ambiguousResidualRatio: z.number(),
    minSamplesPerLap: z.number(),
  }),
  notes: z.array(z.string()).optional(),
});

export const computeTrackLapPowerTool = defineTool({
  name: "compute_track_lap_power",
  description:
    "Join a track lap-timer export to the activity's streams and return per-lap " +
    "power, cadence and heart rate for each scored run, with the rolling entry " +
    "excluded. Alignment is fitted by matching recorded cadence to the cadence each " +
    "lap time implies, so every run reports its fit residual (rpm), the offset " +
    "interval the fit cannot separate, and a verdict — a weak or ambiguous " +
    "alignment withholds per-lap readings rather than returning plausible fiction. " +
    "The drivetrain rollout is fitted, not assumed, and returned. " +
    "Pass `sessionId` to take the splits, activity and lap length from a stored " +
    "track session record (see list_track_sessions) — preferred, since the export " +
    "is then never transcribed twice. Otherwise pass `splits` as the export text " +
    "(run, cumulative distance, cumulative time, lap time) with `activityId`. " +
    "Returns: { runs: [{ run, startOffsetSeconds, fittedRolloutMeters, " +
    "confidence, average, laps }], rolloutAgreement, thresholds }.",
  schema: computeTrackLapPowerSchema,
  annotations: READ_ONLY,
  outputSchema: computeTrackLapPowerOutputSchema,
  handler: async (client, args) =>
    client.trackLapAlignment.computeTrackLapPower(
      resolveTrackInputs(client, args)
    ),
});

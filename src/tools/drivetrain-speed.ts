import { z } from "zod";
import { defineTool, UPSERT } from "./define.js";

const createDrivetrainSpeedFitSchema = z.object({
  activityId: z
    .union([z.string(), z.number()])
    .optional()
    .describe(
      'Track activity ID (e.g. "i164949895", or a bare number) whose original FIT ' +
        "upload is rewritten. Required unless sessionId names a record carrying one."
    ),
  sessionId: z
    .string()
    .optional()
    .describe(
      "A track session record (list_track_sessions): supplies the gear and rollout, " +
        "and turns on the comparison against its lap splits."
    ),
  gear: z
    .string()
    .optional()
    .describe(
      'Drivetrain as "chainring x cog", e.g. "64x16" — never gear inches. ' +
        "Overrides the record's. Required without a sessionId."
    ),
  rolloutMm: z
    .number()
    .positive()
    .optional()
    .describe("Tyre rollout in mm. Defaults to the record's, else 2099."),
  onTrack: z
    .array(
      z.object({
        startSeconds: z.number().min(0),
        endSeconds: z.number().positive(),
      })
    )
    .optional()
    .describe(
      "Restrict speed to these stretches, in seconds from the recording's start " +
        "(the activity's stream time). Use it to keep a roller warm-up in the same " +
        "file from becoming phantom distance. Omit to write speed wherever cadence exists."
    ),
  outputPath: z
    .string()
    .optional()
    .describe(
      "Where to write the rewritten FIT file. Defaults to out/fit/<activityId>-drivetrain-speed.fit in the repo."
    ),
});

const spread = z.object({
  median: z.number(),
  p10: z.number(),
  p90: z.number(),
});

const createDrivetrainSpeedFitOutputSchema = z.object({
  activityId: z.string(),
  outputPath: z.string(),
  development: z.object({
    meters: z.number(),
    gear: z.string().optional(),
    rolloutMm: z.number().optional(),
    source: z.enum(["gear", "supplied"]),
  }),
  recording: z.object({
    records: z.number(),
    withSpeed: z.number(),
    missingCadence: z.number(),
    outsideOnTrack: z.number(),
    pauses: z.number(),
    pausedSeconds: z.number(),
    samplingIntervalSeconds: z.number(),
  }),
  totals: z.object({
    distanceMeters: z.number(),
    maxSpeedMetersPerSecond: z.number().optional(),
  }),
  sensor: z
    .object({
      samplesCompared: z.number(),
      speedDifferencePercent: spread,
      sensorImpliedDevelopmentMeters: z.number(),
      sensorDistanceMeters: z.number(),
      drivetrainDistanceMeters: z.number(),
      distanceDifferencePercent: z.number(),
    })
    .optional(),
  splits: z
    .object({
      sessionId: z.string(),
      lapDistanceMeters: z.number(),
      runs: z.array(
        z.object({
          run: z.string(),
          verdict: z.enum(["strong", "marginal", "weak", "ambiguous"]),
          scoredDistanceMeters: z.number(),
          drivetrainDistanceMeters: z.number(),
          errorPercent: z.number(),
          sensorDistanceMeters: z.number().optional(),
          sensorErrorPercent: z.number().optional(),
          fittedDevelopmentMeters: z.number(),
          laps: z
            .array(
              z.object({
                index: z.number(),
                lapTimeSeconds: z.number(),
                drivetrainDistanceMeters: z.number(),
                errorPercent: z.number(),
                sensorErrorPercent: z.number().optional(),
              })
            )
            .optional(),
          lapsWithheld: z.string().optional(),
        })
      ),
      errorPercent: z.number(),
      sensorErrorPercent: z.number().optional(),
    })
    .optional(),
  notes: z.array(z.string()).optional(),
});

export const createDrivetrainSpeedFitTool = defineTool({
  name: "create_drivetrain_speed_fit",
  description:
    "Add speed and distance to a track ride recorded without a speed sensor. Fetches " +
    "the activity's original FIT upload and writes a copy locally in which every " +
    "record carries Drivetrain speed — true development (chainring/cog × rollout) × " +
    "cadence ÷ 60 — and lap/session distance and speed totals are recomputed to match. " +
    "Everything else in the file is copied byte for byte; upload the result yourself. " +
    "Speed the file already had is replaced and reported as a sensor cross-check. " +
    "With a sessionId, each run's drivetrain distance over its aligned window is " +
    "checked against the lap splits — the reference. Nothing on Intervals.icu changes. " +
    "Returns: { outputPath, development, recording, totals, sensor?, splits? }.",
  schema: createDrivetrainSpeedFitSchema,
  annotations: UPSERT,
  outputSchema: createDrivetrainSpeedFitOutputSchema,
  handler: async (services, args) => services.track.drivetrainSpeed(args),
});

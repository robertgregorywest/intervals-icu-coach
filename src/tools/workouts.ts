import { z } from "zod";
import type { IIntervalsClient } from "../index.js";
import { defineTool, UPSERT } from "./define.js";
import {
  unreviewableWorkSteps,
  type UnreviewableStep,
} from "../services/prescription/index.js";
import { KEY_SESSION_FLOOR_PCT_FTP } from "../services/execution-digest/index.js";
import { workoutEvent } from "../services/workout-builder/index.js";
import type { SportType } from "../types.js";
import { dateString } from "./common.js";

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

export const workoutStepSchema = z.object({
  label: z.string().optional().describe("Optional label/cue for this step"),
  duration: z
    .string()
    .describe(
      'Step duration or distance, e.g. "5m", "30s", "1h2m30s", "2km", "500mtr"'
    ),
  target: z
    .string()
    .optional()
    .describe(
      "Intensity target — prefer absolute watts when user gives specific power numbers. " +
        'A range like "160w-256w" is a steady target BAND (ride held within the range), NOT a ramp. ' +
        'Examples: "200w" (watts), "160w-256w" (watt band), "75%" (FTP%), "Z2" (zone), "70% HR", "5:00/km Pace"'
    ),
  cadence: z.string().optional().describe('Cadence target, e.g. "90rpm"'),
  ramp: z
    .boolean()
    .optional()
    .describe(
      "Set true ONLY for a genuine linear ramp where the target rises across the step (ramp test, warm-up build). " +
        'A steady endurance/sweet-spot/recovery band must NOT set ramp — a plain range like "160w-256w" is already a held band; ' +
        "setting ramp forces a linear sweep across the whole step. A long/wide ramp also collapses to one average wattage on " +
        "head units, so split real ramps into steps of ≤ 2 min and ≤ ~25–30 W each."
    ),
});

export const repeatBlockSchema = z.object({
  iterations: z.number().describe("Number of times to repeat the steps"),
  label: z
    .string()
    .optional()
    .describe('Optional label for the repeat block, e.g. "Main Set"'),
  steps: z.array(workoutStepSchema).describe("Steps to repeat"),
});

const createWorkoutSchema = z.object({
  name: z.string().describe("Workout name"),
  date: dateString.describe("Date in YYYY-MM-DD format"),
  sportType: sportTypeEnum.describe(
    "Sport type — Ride/Run/Swim/VirtualRide/MountainBikeRide/GravelRide/TrailRun/WeightTraining/Yoga/Hike/OpenWaterSwim"
  ),
  steps: z
    .array(z.union([workoutStepSchema, repeatBlockSchema]))
    .min(1)
    .describe(
      "Workout steps — simple steps and/or repeat blocks. " +
        'Example: [{ label: "Warmup", duration: "10m", target: "160w-200w" }, ' +
        '{ iterations: 4, steps: [{ duration: "5m", target: "240w" }, { duration: "3m", target: "150w" }] }]'
    ),
  notes: z
    .string()
    .optional()
    .describe(
      "Session-level prose (framing, cues, rationale) emitted above the step lines, " +
        "separated by a blank line. Prefer this to stuffing prose into step labels, " +
        "which Intervals.icu silently truncates. Avoid lines starting with '-' or " +
        "a repeat header such as '3x' — they would parse as steps."
    ),
  externalId: z
    .string()
    .optional()
    .describe("Optional external ID for upsert matching"),
  color: z.string().optional().describe("Optional event color"),
});

const createWorkoutOutputSchema = z.object({
  success: z.literal(true),
  created: z.number(),
  unreviewableSteps: z
    .array(
      z.object({
        index: z.number(),
        label: z.string().optional(),
        watts: z.number(),
      })
    )
    .optional()
    .describe(
      "Steps prescribed at or above the key-session floor whose label declares " +
        "no work role, so get_execution_digest will never judge them. A warning, " +
        "not a refusal — a ramp test and a warm-up build are meant to go unjudged."
    ),
  events: z.array(
    z.object({
      id: z.number().optional(),
      name: z.string(),
      start_date_local: z.string(),
      description: z.string(),
    })
  ),
});

export const createWorkoutTool = defineTool({
  name: "create_workout",
  description:
    "Create a structured workout on the athlete's Intervals.icu calendar. " +
    "IMPORTANT: When the user specifies power targets in watts, always use absolute watts " +
    '(e.g. "200w", "160w-256w") — do NOT convert to percentages. ' +
    'Percentage targets like "75%" are relative to FTP which may not match the user\'s intent. ' +
    "Supports simple steps, ramps, and repeat blocks. " +
    "Optional 'notes' carries session-level prose above the steps. " +
    "To schedule a saved library workout use schedule_library_workout instead. " +
    "Idempotent on externalId — same externalId upserts the existing event. " +
    "Returns: { success: true, created: N, events: [...] }.",
  schema: createWorkoutSchema,
  annotations: UPSERT,
  outputSchema: createWorkoutOutputSchema,
  async handler(client, args) {
    const event = client.workoutBuilder.buildEvent(args);
    const result = await client.events.createEvents([event]);

    return {
      ...formatResponse(result),
      ...(await unreviewableWarning(client, event.description)),
    };
  },
});

/**
 * Best-effort: a warning is worth one athlete lookup, and worth nothing if it
 * can fail the write it is warning about. No FTP, or a lookup that throws, and
 * the workout is created with no warning rather than not created. The anchors
 * carry the power zones too, so a work step written as a zone is judged.
 */
async function unreviewableWarning(
  client: IIntervalsClient,
  description: string
): Promise<{ unreviewableSteps?: UnreviewableStep[] }> {
  let anchors;
  try {
    anchors = await client.anchors.getAthleteAnchors();
  } catch {
    return {};
  }

  const { ftp } = anchors;
  const floor = ftp ? (ftp * KEY_SESSION_FLOOR_PCT_FTP) / 100 : undefined;
  const steps = unreviewableWorkSteps(description, floor, anchors);
  return steps.length > 0 ? { unreviewableSteps: steps } : {};
}

const scheduleLibraryWorkoutSchema = z.object({
  id: z.number().describe("Library workout ID (from list_workout_library)"),
  date: dateString.describe("Date in YYYY-MM-DD format"),
  externalId: z
    .string()
    .optional()
    .describe("Optional external ID for upsert matching"),
  color: z.string().optional().describe("Optional event color"),
});

export const scheduleLibraryWorkoutTool = defineTool({
  name: "schedule_library_workout",
  description:
    "Schedule a saved library workout onto the calendar, copying its description " +
    "verbatim — prose, steps and template trailer — so nothing is lost. " +
    "Prefer this to re-expressing a library item as create_workout steps. " +
    "Idempotent on externalId — same externalId upserts the existing event. " +
    "Returns: { success: true, created: N, events: [...] }.",
  schema: scheduleLibraryWorkoutSchema,
  annotations: UPSERT,
  outputSchema: createWorkoutOutputSchema,
  async handler(client, args) {
    const { workout } = await client.workoutLibrary.get(args.id);
    const description = workout.description ?? "";

    const event = workoutEvent({
      name: workout.name,
      date: args.date,
      type: workout.type as SportType,
      description,
      externalId: args.externalId,
      color: args.color,
    });

    const result = await client.events.createEvents([event]);

    return {
      ...formatResponse(result),
      ...(await unreviewableWarning(client, description)),
    };
  },
});

const createStrengthWorkoutSchema = z.object({
  name: z.string().describe("Strength session name"),
  date: dateString.describe("Date in YYYY-MM-DD format"),
  description: z
    .string()
    .describe(
      "Free-form description of the strength session. " +
        "Include exercises, sets, reps, load, and RPE. " +
        'Example: "Box Squat 3×5 @ RPE 7\\nTrap Bar Deadlift 3×5 @ RPE 8\\nBulgarian Split Squat 3×8 each leg\\nPull-ups 3×8"'
    ),
  externalId: z
    .string()
    .optional()
    .describe("Optional external ID for upsert matching"),
  color: z.string().optional().describe("Optional event color"),
});

export const createStrengthWorkoutTool = defineTool({
  name: "create_strength_workout",
  description:
    "Create a strength/gym session on the athlete's Intervals.icu calendar as a WeightTraining event. " +
    "Provide a free-form description of exercises, sets, reps, load, and RPE. " +
    "Use this instead of create_workout for gym/strength sessions. " +
    "Idempotent on externalId — same externalId upserts the existing event. " +
    "Returns: { success: true, created: N, events: [...] }.",
  schema: createStrengthWorkoutSchema,
  annotations: UPSERT,
  outputSchema: createWorkoutOutputSchema,
  async handler(client, args) {
    const event = workoutEvent({ ...args, type: "WeightTraining" });
    const result = await client.events.createEvents([event]);
    return formatResponse(result);
  },
});

function formatResponse(
  events: Array<{
    id?: number;
    name: string;
    start_date_local: string;
    description: string;
  }>
): z.infer<typeof createWorkoutOutputSchema> {
  return {
    success: true,
    created: events.length,
    events: events.map((e) => ({
      id: e.id,
      name: e.name,
      start_date_local: e.start_date_local,
      description: e.description,
    })),
  };
}

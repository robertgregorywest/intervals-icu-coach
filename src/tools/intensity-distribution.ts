import { z } from "zod";
import { normalizeActivityId } from "../services/activities/index.js";
import { defineTool, READ_ONLY } from "./define.js";

// Plain object rather than a `.refine()`d one, matching compare_planned_vs_actual:
// the MCP adapter registers `schema.shape`, which a ZodEffects wrapper does not
// expose. The single-session / range choice is enforced in the handler.
const compareIntensityDistributionSchema = z.object({
  activityId: z
    .union([z.string(), z.number()])
    .optional()
    .describe(
      'Completed activity ID (e.g. "i171371339" from get_activities, or a bare ' +
        "number). The planned event is resolved from the activity's paired event. " +
        "Single-session form: supply exactly one of activityId or eventId."
    ),
  eventId: z
    .number()
    .optional()
    .describe(
      "Planned event ID. The completed activity is located by scanning a " +
        "narrow date window for the ride paired to this event."
    ),
  oldest: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional()
    .describe(
      "Range form: start date (YYYY-MM-DD). Supply with `newest` and neither " +
        "identifier. Maximum 28 days."
    ),
  newest: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional()
    .describe("Range form: end date (YYYY-MM-DD), inclusive."),
});

const zoneName = z.enum([
  "REC",
  "L1",
  "L2",
  "L3",
  "L4",
  "L5",
  "L6",
  "L7",
  "NMP",
]);

const reasonCode = z.enum([
  "no-paired-event",
  "no-paired-activity",
  "no-structured-steps",
  "no-recorded-power",
  "no-coaching-zones",
]);

const partitionBand = z.object({
  name: zoneName,
  lowW: z.number(),
  highW: z.number().optional(),
  coachingHighW: z.number(),
});

const zoneRow = z.object({
  zone: zoneName,
  lowW: z.number(),
  highW: z.number().optional(),
  plannedSeconds: z.number(),
  deliveredSeconds: z.number(),
  deltaSeconds: z.number(),
});

const middleBand = z.object({
  lowW: z.number(),
  highW: z.number(),
  lowPctFtp: z.number(),
  highPctFtp: z.number(),
  plannedSeconds: z.number(),
  deliveredSeconds: z.number(),
  deltaSeconds: z.number(),
  deliveredFraction: z.number().optional(),
});

const compareIntensityDistributionOutputSchema = z.object({
  // Single-session form.
  activityId: z.string().optional(),
  eventId: z.number().optional(),
  activityName: z.string().optional(),
  eventName: z.string().optional(),
  date: z.string().optional(),
  plannedTotalSeconds: z.number().optional(),
  deliveredTotalSeconds: z.number().optional(),
  unbucketedSteps: z
    .array(
      z.object({
        index: z.number(),
        label: z.string().optional(),
        durationSeconds: z.number().optional(),
        reason: z.string(),
      })
    )
    .optional(),
  boundarySpanningSteps: z
    .array(
      z.object({
        index: z.number(),
        label: z.string().optional(),
        lowW: z.number(),
        highW: z.number(),
        assignedZone: zoneName,
        midpointW: z.number(),
      })
    )
    .optional(),
  reason: reasonCode.optional(),
  message: z.string().optional(),

  // Range form.
  oldest: z.string().optional(),
  newest: z.string().optional(),
  sessions: z
    .array(
      z.object({
        date: z.string().optional(),
        activityId: z.string().optional(),
        eventId: z.number().optional(),
        name: z.string().optional(),
        middleBandPlannedSeconds: z.number(),
        middleBandDeliveredSeconds: z.number(),
        middleBandDeliveredFraction: z.number().optional(),
      })
    )
    .optional(),
  excluded: z
    .array(
      z.object({
        date: z.string().optional(),
        activityId: z.string().optional(),
        eventId: z.number().optional(),
        name: z.string().optional(),
        reason: reasonCode,
        message: z.string(),
      })
    )
    .optional(),

  // Both forms.
  boundaries: z.array(partitionBand).optional(),
  zones: z.array(zoneRow).optional(),
  middleBand: middleBand.optional(),
});

export const compareIntensityDistributionTool = defineTool({
  name: "compare_intensity_distribution",
  description:
    "Answer whether the prescribed dose was actually delivered, as time at " +
    "intensity. The companion to compare_planned_vs_actual, not a replacement: " +
    "that tool says what happened within reps, this one says how much of the " +
    "prescribed dose landed. " +
    "Both sides are computed here — the planned distribution from the event's " +
    "own workout steps and the delivered one from the recorded power stream — " +
    "never read from the platform's precomputed zone times, which are snapshots " +
    "taken at authoring and at upload and can disagree for reasons unrelated to " +
    "what was ridden. Because workouts are authored in absolute watts, a threshold " +
    "change between prescribing and riding does not affect the comparison. " +
    "Needs no step-to-interval alignment, so it works where compare_planned_vs_actual " +
    "returns alignmentBasis 'none': track sessions, auto-lapped rides, abandoned sessions. " +
    "Bucketing frame is a partition derived from the athlete's MAP coaching zones " +
    "(which overlap, so each wattage is assigned to the highest zone whose floor it " +
    "reaches); the boundaries used are reported with every result. The middle band " +
    "(76–106% FTP) is reported separately from its own bounds, not by summing zones — " +
    "it is the coaching philosophy's primary judge of a build week. " +
    "Delivered seconds sum to recording time, not elapsed time: paused time belongs " +
    "to no zone. Range targets are bucketed by midpoint, and any step whose range " +
    "straddled a boundary is reported. " +
    "Two forms: single session (exactly one of activityId or eventId) or date range " +
    "(oldest and newest, max 28 days) which sums across paired sessions and lists " +
    "per-session middle-band figures plus the sessions excluded from the sums. " +
    "Refusals are explicit via reason: no-paired-event, no-paired-activity, " +
    "no-structured-steps, no-recorded-power, no-coaching-zones. " +
    "Returns: { boundaries, zones: [{ zone, plannedSeconds, deliveredSeconds, " +
    "deltaSeconds }], middleBand, boundarySpanningSteps, unbucketedSteps, reason? } " +
    "or, for a range, { zones, middleBand, sessions: [...], excluded: [...] }.",
  schema: compareIntensityDistributionSchema,
  annotations: READ_ONLY,
  outputSchema: compareIntensityDistributionOutputSchema,
  async handler(client, args) {
    const hasRange = !!args.oldest || !!args.newest;
    const hasSession = !!args.activityId || !!args.eventId;

    // Which form was asked for is this tool's to decide — the service has one
    // method per form. Exactly-one-of within the single form is the loader's.
    if (hasRange && hasSession) {
      throw new Error(
        "Supply either a single session (activityId or eventId) or a date range " +
          "(oldest and newest) — not both."
      );
    }

    if (hasRange) {
      if (!args.oldest || !args.newest) {
        throw new Error(
          "The range form needs both oldest and newest (YYYY-MM-DD)."
        );
      }
      return client.executionReview.compareIntensityDistributionRange({
        oldest: args.oldest,
        newest: args.newest,
      });
    }

    return client.executionReview.compareIntensityDistribution({
      activityId:
        args.activityId === undefined
          ? undefined
          : normalizeActivityId(args.activityId),
      eventId: args.eventId,
    });
  },
});

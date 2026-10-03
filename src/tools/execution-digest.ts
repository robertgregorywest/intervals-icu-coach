import { z } from "zod";
import { dateString } from "./common.js";
import { defineTool, READ_ONLY } from "./define.js";

const getExecutionDigestSchema = z.object({
  oldest: dateString.describe(
    "Window start (YYYY-MM-DD). The coaching log's `reviewed-through` " +
      "watermark, not a date derived from conversation history."
  ),
  newest: dateString.describe(
    "Window end (YYYY-MM-DD), inclusive. Maximum 28 days."
  ),
});

const powerTarget = z.object({
  watts: z.number().optional(),
  low: z.number().optional(),
  high: z.number().optional(),
  ramp: z.boolean().optional(),
});

const flaggedStep = z.object({
  index: z.number(),
  workRep: z
    .number()
    .describe(
      "1-based position of this step's rep among the session's work reps."
    ),
  repIndex: z.number().optional(),
  repCount: z.number().optional(),
  stepInRep: z.number().optional(),
  durationSeconds: z.number().optional(),
  target: powerTarget.optional(),
  outcome: z
    .enum(["missed", "exceeded", "unjudged"])
    .describe(
      "missed: under its power by more than noise, under its cadence, or not " +
        "attempted. exceeded: over its power by more than noise at its cadence — " +
        "never set on a test or primer, whose target is a floor. unjudged: unpaired."
    ),
  verdict: z.enum(["on-target", "over", "under", "not-attempted", "unmatched"]),
  verdictBasis: z.enum([
    "average-watts",
    "normalized-power",
    "normalized-power-fallback",
  ]),
  deltas: z
    .object({
      watts: z.number().optional(),
      wattsFraction: z.number().optional(),
      cadence: z.number().optional(),
    })
    .optional(),
  cadenceVerdict: z.enum(["on-target", "over", "under"]).optional(),
  coastingFraction: z.number().optional(),
});

const digestSession = z.object({
  eventId: z.number().optional(),
  activityId: z.string().optional(),
  date: z.string().optional(),
  name: z.string().optional(),
  outcome: z
    .enum(["landed", "exceeded", "partial", "missed", "unverified"])
    .describe(
      "The Session outcome. unverified: no alignment, no work steps, none paired, " +
        "or drifted rep boundaries — never evidence the session was not ridden. " +
        "missed: every work step missed. partial: some did. exceeded: none missed, " +
        "at least one over. landed: every work step met its prescription."
    ),
  fade: z
    .literal(true)
    .optional()
    .describe(
      "partial only: the misses are the last two or more reps and nothing earlier."
    ),
  recursInWindow: z
    .literal(true)
    .optional()
    .describe(
      "partial only: another partial session in the window missed a rep in the same position."
    ),
  executionRecord: z.enum(["device-laps", "detected-intervals"]),
  executionRecordNote: z.string().optional(),
  alignmentBasis: z.enum(["sequential", "duration", "none"]),
  workSteps: z.number(),
  unclassifiedSteps: z.number(),
  flagged: z.array(flaggedStep),
  middleBandPlannedSeconds: z.number().optional(),
  middleBandDeliveredSeconds: z.number().optional(),
  middleBandDeliveredFraction: z.number().optional(),
  reason: z
    .enum([
      "no-paired-event",
      "no-paired-activity",
      "no-structured-steps",
      "no-intervals",
      "alignment-failed",
    ])
    .optional(),
  message: z.string().optional(),
});

const getExecutionDigestOutputSchema = z.object({
  oldest: z.string(),
  newest: z.string(),
  status: z.enum(["reviewed", "skipped"]),
  reviewedThrough: z.string().optional(),
  message: z.string().optional(),
  middleBand: z
    .object({
      lowW: z.number(),
      highW: z.number(),
      lowPctFtp: z.number(),
      highPctFtp: z.number(),
      plannedSeconds: z.number(),
      deliveredSeconds: z.number(),
      deltaSeconds: z.number(),
      deliveredFraction: z.number().optional(),
    })
    .optional(),
  sessions: z.array(digestSession),
  excluded: z.array(
    z.object({
      date: z.string().optional(),
      activityId: z.string().optional(),
      eventId: z.number().optional(),
      name: z.string().optional(),
      reason: z.enum([
        "no-paired-event",
        "no-paired-activity",
        "no-structured-steps",
        "no-recorded-power",
        "no-coaching-zones",
      ]),
    })
  ),
  nonKeySessions: z.number(),
});

export const getExecutionDigestTool = defineTool({
  name: "get_execution_digest",
  description:
    "The execution review for a coaching window, computed in one call: which " +
    "key sessions the window held, how much of the prescribed dose landed, and " +
    "each session's outcome with the work steps behind it. Runs both lenses — " +
    "compare_intensity_distribution over the window and compare_planned_vs_actual " +
    "per key session — and returns only what a coach reads. " +
    "Key sessions are selected on the planned side (a declared work step " +
    "prescribed at or above 88% FTP, the sweet-spot floor), so a key session " +
    "that was abandoned or never started is reported rather than silently missed; " +
    "a window holding none returns status 'skipped' and the watermark stays put. " +
    "Work steps are read from the step label's first word against a closed " +
    "vocabulary (see create_workout's step label) — not inferred from " +
    "intensity. A step whose label declares no work role is never judged, and " +
    "unclassifiedSteps counts them so a work step with an unrecognised label is " +
    "visible rather than silently dropped. " +
    "Mechanically filtered out: steps meeting both their power and cadence, band " +
    "steps outside their own band by under 3% (directional noise, since a range " +
    "target carries no tolerance), and a test or primer ridden over its floor. " +
    "Each session is read to an outcome — landed, exceeded, partial, missed or " +
    "unverified — with fade and recursInWindow on a partial one. Whether a " +
    "partial miss continues an open thread, and what to change, is the caller's. " +
    "Returns: { status, reviewedThrough?, middleBand, sessions: [{ date, name, " +
    "outcome, fade?, recursInWindow?, executionRecord, alignmentBasis, workSteps, " +
    "unclassifiedSteps, flagged: [...], middleBand*, reason? }], excluded, " +
    "nonKeySessions }.",
  schema: getExecutionDigestSchema,
  annotations: READ_ONLY,
  outputSchema: getExecutionDigestOutputSchema,
  handler: (services, args) =>
    services.executionReview.getExecutionDigest({
      oldest: args.oldest,
      newest: args.newest,
    }),
});

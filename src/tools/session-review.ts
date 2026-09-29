import { z } from "zod";
import { activityIdField } from "./common.js";
import { defineTool, READ_ONLY } from "./define.js";

// Deliberately a plain object rather than a `.refine()`d one: the MCP adapter
// registers `schema.shape`, which a ZodEffects wrapper does not expose. The
// exactly-one rule is enforced by the paired-session loader, before any request.
const comparePlannedVsActualSchema = z.object({
  activityId: activityIdField
    .optional()
    .describe(
      'Completed activity ID (e.g. "i171371339" from get_activities, or a bare ' +
        "number). The planned event is resolved from the activity's paired event."
    ),
  eventId: z
    .number()
    .optional()
    .describe(
      "Planned event ID. The completed activity is located by scanning a " +
        "narrow date window for the ride paired to this event."
    ),
  tolerance: z
    .number()
    .positive()
    .max(1)
    .optional()
    .describe(
      "Power tolerance as a fraction for point targets (default: 0.05 = ±5%). " +
        "Range targets are judged on their own band and are not widened by this."
    ),
});

const powerTargetShape = z.object({
  watts: z.number().optional(),
  low: z.number().optional(),
  high: z.number().optional(),
  ramp: z.boolean().optional(),
});

const alignedStepShape = z.object({
  index: z.number(),
  label: z.string().optional(),
  repIndex: z.number().optional(),
  repCount: z.number().optional(),
  stepInRep: z.number().optional(),
  planned: z.object({
    durationSeconds: z.number().optional(),
    target: powerTargetShape.optional(),
    cadence: z.number().optional(),
    cadenceRange: z.object({ low: z.number(), high: z.number() }).optional(),
  }),
  delivered: z
    .object({
      intervalIndex: z.number(),
      durationSeconds: z.number(),
      averageWatts: z.number().optional(),
      averageCadence: z.number().optional(),
      averageHeartrate: z.number().optional(),
    })
    .optional(),
  deltas: z
    .object({
      durationSeconds: z.number().optional(),
      watts: z.number().optional(),
      wattsFraction: z.number().optional(),
      cadence: z.number().optional(),
    })
    .optional(),
  verdict: z.enum(["on-target", "over", "under", "not-attempted", "unmatched"]),
  cadenceVerdict: z
    .enum(["on-target", "over", "under"])
    .optional()
    .describe(
      "Delivered average cadence against the planned cadence, judged " +
        "independently of the power verdict. Present only when the step " +
        "prescribes a cadence and recorded one."
    ),
  note: z.string().optional(),
});

const comparePlannedVsActualOutputSchema = z.object({
  activityId: z.string().optional(),
  eventId: z.number().optional(),
  activityName: z.string().optional(),
  eventName: z.string().optional(),
  date: z.string().optional(),
  tolerance: z.number(),
  executionRecord: z
    .enum(["device-laps", "detected-intervals"])
    .describe(
      "Which record of the ride the step comparison was read from. " +
        "'device-laps' is the faithful record the head unit wrote; " +
        "'detected-intervals' is Intervals.icu's derived, editable segmentation, " +
        "used only when laps are unavailable or cannot explain the session."
    ),
  executionRecordNote: z
    .string()
    .optional()
    .describe(
      "Present when the derived intervals were used and are known to have " +
        "drifted from the recorded laps — read per-step power with caution."
    ),
  alignmentBasis: z.enum(["sequential", "duration", "none"]),
  matchedFraction: z.number(),
  steps: z.array(alignedStepShape),
  rollup: z.object({
    plannedLoad: z.number().optional(),
    actualLoad: z.number().optional(),
    plannedDurationSeconds: z.number().optional(),
    actualDurationSeconds: z.number().optional(),
    platformCompliance: z.number().optional(),
    unplannedIntervals: z.array(
      z.object({
        intervalIndex: z.number(),
        type: z.string().optional(),
        durationSeconds: z.number(),
        averageWatts: z.number().optional(),
      })
    ),
  }),
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

export const comparePlannedVsActualTool = defineTool({
  name: "compare_planned_vs_actual",
  description:
    "Verify whether a session was executed as prescribed. " +
    "Pairs a completed activity with its planned event (supply exactly one of " +
    "activityId or eventId — the other is resolved via the activity's paired event) " +
    "and reports, per planned step, the prescribed duration and power target " +
    "beside the delivered duration and average power, the deltas, and a verdict " +
    "(on-target / over / under / not-attempted / unmatched). Repeat blocks are " +
    "compared rep by rep, so decay across reps is visible. " +
    "Where a step prescribes a cadence, cadenceVerdict (on-target / over / under) " +
    "and deltas.cadence judge the delivered average cadence beside the power " +
    "verdict, never folded into it: point targets allow ±5 rpm, ranges their own band. " +
    "Steps are compared against the laps the head unit recorded, read from the " +
    "original upload — the faithful record of what the athlete marked. " +
    "Intervals.icu's own icu_intervals analysis is derived and editable and can " +
    "re-cut rep boundaries, so it is used only when laps are unavailable (no FIT " +
    "file, or the ride was never lapped) or cannot explain the session. " +
    "executionRecord names which was used; executionRecordNote flags a derived " +
    "reading known to have drifted from the laps. " +
    "Alignment is deliberately conservative and reads duration only, never power: " +
    "alignmentBasis is 'sequential' (matched in order), 'duration' (partial match), " +
    "or 'none' (declined to guess). A 'none' result still returns the roll-up. " +
    "Refusals are explicit via reason: no-paired-event, no-paired-activity, " +
    "no-structured-steps, no-intervals, alignment-failed. " +
    "Optional tolerance (fraction, default 0.05) applies to point targets only; " +
    "range targets are judged on their own band. " +
    "Returns: { executionRecord, executionRecordNote?, alignmentBasis, matchedFraction, " +
    "tolerance, steps: [...], " +
    "rollup: { plannedLoad, actualLoad, platformCompliance, unplannedIntervals }, reason? }.",
  schema: comparePlannedVsActualSchema,
  annotations: READ_ONLY,
  outputSchema: comparePlannedVsActualOutputSchema,
  handler: (services, args) =>
    services.executionReview.comparePlannedVsActual({
      activityId: args.activityId,
      eventId: args.eventId,
      tolerance: args.tolerance,
    }),
});

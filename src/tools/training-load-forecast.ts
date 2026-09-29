import { z } from "zod";
import { dateString } from "./common.js";
import { defineTool, READ_ONLY } from "./define.js";
import { SPORT_TYPES } from "../types.js";
import { MAX_FORECAST_DAYS } from "../services/training-load/index.js";
import { round } from "../shared/round.js";

const proposedSessionSchema = z.object({
  date: dateString.describe("Date of the session, YYYY-MM-DD."),
  name: z.string().optional().describe("Label for the session in the result."),
  description: z
    .string()
    .optional()
    .describe(
      "Workout text in the `- step` / `Nx` grammar, parsed locally and costed " +
        "from its own steps. Use absolute watts — a percentage or zone target " +
        "is resolved against the forecast's FTP, which may not be what you mean."
    ),
  load: z
    .number()
    .min(0)
    .optional()
    .describe(
      "Training load to assume, for a session whose shape is not yet decided " +
        '("assume 180 for the club run"). Ignored when description is given.'
    ),
  durationSeconds: z
    .number()
    .int()
    .positive()
    .optional()
    .describe(
      "Duration for a load-only session, so weekly hours stay meaningful."
    ),
  type: z
    .enum(SPORT_TYPES)
    .optional()
    .describe(
      "Sport, default Ride. WeightTraining contributes no load, matching " +
        "Intervals.icu, which assigns none either."
    ),
});

const forecastTrainingLoadSchema = z.object({
  oldest: dateString.describe(
    "First day of the forecast window, YYYY-MM-DD. The window, oldest to " +
      `newest inclusive, spans at most ${MAX_FORECAST_DAYS} days.`
  ),
  newest: dateString.describe(
    "Last day of the forecast window, YYYY-MM-DD, on or after oldest and at " +
      `most ${MAX_FORECAST_DAYS} days in from it (inclusive). Forecast a block ` +
      "at a time — the model compounds, so a longer projection reflects the " +
      "assumed sessions more than the athlete."
  ),
  sessions: z
    .array(proposedSessionSchema)
    .optional()
    .describe(
      "Sessions to overlay on the calendar, keyed by date. A date carrying a " +
        "proposed session drops whatever is planned for it; a date with none " +
        "keeps what is already there, so a partly-fixed week needs no restating."
    ),
  seed: z
    .object({ ctl: z.number(), atl: z.number() })
    .optional()
    .describe(
      "Fitness and fatigue to start from, instead of the delivered wellness " +
        "record for the day before the window. Use for a what-if from a state " +
        "the athlete is not actually in."
    ),
  ftp: z
    .number()
    .positive()
    .optional()
    .describe(
      "Threshold to resolve targets against, instead of the athlete's own. " +
        "The result names whichever was used."
    ),
});

const streamGapShape = z.object({
  stepIndex: z.number(),
  label: z.string().optional(),
  reason: z.string(),
});

const forecastTrainingLoadOutputSchema = z.object({
  oldest: z.string(),
  newest: z.string(),
  basis: z
    .object({
      ftp: z.number(),
      ftpSource: z.enum(["caller-supplied", "athlete-sport-settings"]),
      powerZones: z.array(z.number()).nullable(),
      ctlDays: z.number(),
      atlDays: z.number(),
      timeConstantsSource: z.enum([
        "athlete-sport-settings",
        "platform-defaults",
      ]),
      seedDate: z.string(),
      seedSource: z.enum(["delivered-wellness", "caller-supplied"]),
      seedCtl: z.number(),
      seedAtl: z.number(),
      historyDays: z.number(),
    })
    .describe(
      "What the forecast rests on. Read it before quoting a figure: a forecast " +
        "at one FTP is not comparable to one at another."
    ),
  days: z.array(
    z.object({
      date: z.string(),
      load: z.number(),
      ctl: z.number(),
      atl: z.number(),
      tsb: z.number(),
      ramp: z.number().optional(),
    })
  ),
  weeks: z.array(
    z.object({
      weekStart: z.string(),
      weekEnd: z.string(),
      load: z.number(),
      durationSeconds: z.number(),
      ctlStart: z.number(),
      ctlEnd: z.number(),
      ramp: z.number(),
      complete: z.boolean(),
    })
  ),
  sessions: z.array(
    z.object({
      date: z.string(),
      name: z.string().optional(),
      type: z.string().optional(),
      eventId: z.number().optional(),
      origin: z.enum(["planned", "proposed"]),
      load: z.number(),
      durationSeconds: z.number().optional(),
      source: z.enum([
        "local-parse",
        "platform",
        "caller-supplied",
        "unmodelled-strength",
        "underivable",
      ]),
      normalizedPower: z.number().optional(),
      intensityFactor: z.number().optional(),
      gaps: z.array(streamGapShape).optional(),
      note: z.string().optional(),
    })
  ),
  notes: z.array(z.string()),
});

export const forecastTrainingLoadTool = defineTool({
  name: "forecast_training_load",
  description:
    "Forecast the CTL/ATL/TSB trajectory of a set of proposed sessions " +
    "WITHOUT writing anything to the calendar. Use this to check a draft " +
    "week or block against its ramp target before committing it, instead of " +
    "writing events and reading icu_ctl back. " +
    "Proposed sessions overlay whatever is already planned, keyed by date: a " +
    "date you supply a session for drops its planned work, a date you do not " +
    "keeps it — so a partly-fixed week needs no restating. " +
    "A session carries either a workout `description` (parsed locally and " +
    "costed from its own steps, matching what Intervals.icu will show once " +
    "written) or a `load` figure directly, for a session whose shape is not " +
    "yet decided. " +
    "Strength sessions contribute no load, matching the platform. " +
    "Every result states its basis (FTP, time constants, seed) and every " +
    "session states where its load came from — never mistake a forecast " +
    "figure for one the platform computed. " +
    "Window max " +
    MAX_FORECAST_DAYS +
    " days. " +
    "Returns: { oldest, newest, basis, days: [{ date, load, ctl, atl, tsb, ramp }], " +
    "weeks: [{ weekStart, load, durationSeconds, ctlStart, ctlEnd, ramp, complete }], " +
    "sessions: [{ date, name, origin, load, source, ... }], notes }.",
  schema: forecastTrainingLoadSchema,
  annotations: READ_ONLY,
  outputSchema: forecastTrainingLoadOutputSchema,
  async handler(services, args) {
    const result = await services.trainingLoad.forecast({
      oldest: args.oldest,
      newest: args.newest,
      sessions: args.sessions,
      seed: args.seed,
      ftp: args.ftp,
    });

    // Rounded for reading, not for arithmetic — the model carried full precision
    // and the trajectory below is a projection of it, not a re-derivation.
    return {
      oldest: result.oldest,
      newest: result.newest,
      basis: {
        ...result.basis,
        seedCtl: round(result.basis.seedCtl, 2),
        seedAtl: round(result.basis.seedAtl, 2),
      },
      days: result.days.map((d) => ({
        date: d.date,
        load: d.load,
        ctl: round(d.ctl, 2),
        atl: round(d.atl, 2),
        tsb: round(d.tsb, 2),
        ...(d.ramp !== undefined ? { ramp: round(d.ramp, 2) } : {}),
      })),
      weeks: result.weeks.map((w) => ({
        ...w,
        ctlStart: round(w.ctlStart, 2),
        ctlEnd: round(w.ctlEnd, 2),
        ramp: round(w.ramp, 2),
      })),
      sessions: result.sessions.map((s) => ({
        ...s,
        ...(s.normalizedPower !== undefined
          ? { normalizedPower: Math.round(s.normalizedPower) }
          : {}),
        ...(s.intensityFactor !== undefined
          ? { intensityFactor: round(s.intensityFactor, 3) }
          : {}),
      })),
      notes: result.notes,
    };
  },
});

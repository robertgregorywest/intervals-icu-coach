import { z } from "zod";
import { defineTool, READ_ONLY } from "./define.js";

const computePowerProfileSchema = z.object({
  mapWatts: z
    .number()
    .positive()
    .optional()
    .describe(
      "Override MAP in watts. If omitted, derived from the latest 'MAP ramp test' " +
        "activity on Intervals.icu (last 90 days, excluding '(skip)')."
    ),
  weightKg: z
    .number()
    .positive()
    .optional()
    .describe("Override body mass in kg. Defaults to athlete profile."),
  ftpWatts: z
    .number()
    .positive()
    .optional()
    .describe("Override FTP in watts. Defaults to athlete cycling FTP."),
  sex: z
    .enum(["male", "female"])
    .optional()
    .describe(
      "Override biological sex. Defaults to athlete profile (M/F mapped)."
    ),
  age: z
    .number()
    .int()
    .positive()
    .optional()
    .describe(
      "Override age (years). Defaults to value computed from athlete birthday."
    ),
  heightCm: z
    .number()
    .positive()
    .optional()
    .describe(
      "Override height in cm. Defaults to athlete profile (stored in metres, converted)."
    ),
  p5s: z
    .number()
    .positive()
    .optional()
    .describe(
      "Override best 5-second power. Defaults to last 90 days power curve."
    ),
  p60: z
    .number()
    .positive()
    .optional()
    .describe(
      "Override best 60-second power. Defaults to last 90 days power curve."
    ),
  p5min: z
    .number()
    .positive()
    .optional()
    .describe(
      "Override best 5-minute power. Defaults to last 90 days power curve."
    ),
  aeroPosition: z
    .enum(["road_hoods", "road_drops", "tt", "upright"])
    .optional()
    .describe(
      "Aerodynamic position (for CdA estimate). Caller-supplied — not stored on Intervals.icu."
    ),
  cdaKnown: z
    .number()
    .positive()
    .optional()
    .describe(
      "Known CdA (m²). Overrides position-based estimate when present."
    ),
  discipline: z
    .enum([
      "road_race",
      "tt",
      "crit",
      "mtb",
      "gravel",
      "sportive",
      "track",
      "triathlon",
    ])
    .optional()
    .describe("Primary discipline. Caller-supplied."),
  history: z
    .enum(["new", "intermediate", "experienced"])
    .optional()
    .describe("Training history. Caller-supplied."),
  strength: z
    .enum(["none", "once", "twice", "three_plus"])
    .optional()
    .describe("Strength training frequency. Caller-supplied."),
  weeklyHours: z
    .number()
    .positive()
    .optional()
    .describe("Average weekly training hours. Caller-supplied."),
  masters: z
    .boolean()
    .optional()
    .describe("Force masters flag. Defaults to age >= 40 when age available."),
  powerCurveRange: z
    .string()
    .optional()
    .describe(
      'Power curve range for peak power lookup (default "90d"). Same vocabulary as get_power_curve.'
    ),
});

export const computePowerProfileTool = defineTool({
  name: "compute_power_profile",
  description:
    "Compute the cyclecoach.com power-profile report (Ric Stern) for the connected " +
    "athlete. Pulls MAP (from latest 'MAP ramp test' activity), body mass, FTP, " +
    "sex, age, height, and 5s/60s/5min peak power from Intervals.icu by default; " +
    "every input can be overridden. " +
    "Returns CycleCoach training zones, FTP-vs-MAP sanity check, VO₂max + " +
    "classification, allometric MAP benchmark, Compound Score, PSTS (with CdA), " +
    "TrainingPeaks power profile, rider-type shape, MAP band, TT power estimates, " +
    "and road race/crit estimates. Each section includes a verbatim narrative " +
    "from the source page so coaching context isn't lost.",
  schema: computePowerProfileSchema,
  annotations: READ_ONLY,
  outputSchema: null,
  handler: (services, args) => services.powerProfile.computePowerProfile(args),
});

import { z } from "zod";
import { defineTool, READ_ONLY } from "./define.js";
import { DEFAULT_DAYS, MAX_DAYS } from "../services/coaching-context/index.js";

const getCoachingContextSchema = z.object({
  days: z
    .number()
    .int()
    .min(1)
    .max(MAX_DAYS)
    .optional()
    .describe(
      `Days of wellness history to include (default ${DEFAULT_DAYS}, max ${MAX_DAYS}).`
    ),
});

// HR/pace zones are arrays of boundary values (bpm for HR, pace for run);
// `null` when the athlete hasn't configured that zone set for cycling.
const zoneBoundariesSchema = z.array(z.number()).nullable();

// MAP-anchored training zones — the canonical coaching zones. `null` when MAP is unavailable.
const mapZonesSchema = z
  .array(
    z.object({
      name: z.string(),
      label: z.string(),
      lowPct: z.number(),
      highPct: z.number(),
      lowW: z.number(),
      highW: z.number(),
      pctText: z.string(),
      wattText: z.string(),
    })
  )
  .nullable();

const getCoachingContextOutputSchema = z.object({
  asOf: z.string(),
  daysWindow: z.number(),
  athlete: z.object({
    id: z.string().nullable(),
    name: z.string().nullable(),
    weight: z.number().nullable(),
    ftp: z.number().nullable(),
    lthr: z.number().nullable(),
    max_hr: z.number().nullable(),
    resting_hr: z.number().nullable(),
    hr_zones: zoneBoundariesSchema,
    pace_zones: zoneBoundariesSchema,
    sport_settings_count: z.number(),
  }),
  fitness: z.object({
    date: z.string().nullable(),
    ctl: z.number().nullable(),
    atl: z.number().nullable(),
    tsb: z.number().nullable(),
    ramp_rate: z.number().nullable(),
  }),
  wellnessTrend: z.array(
    z.object({
      date: z.string(),
      ctl: z.number(),
      atl: z.number(),
      tsb: z.number(),
      fatigue: z.number().nullable(),
      soreness: z.number().nullable(),
      motivation: z.number().nullable(),
      mood: z.number().nullable(),
      stress: z.number().nullable(),
      readiness: z.number().nullable(),
      sleep_secs: z.number().nullable(),
      sleep_score: z.number().nullable(),
      resting_hr: z.number().nullable(),
      hrv: z.number().nullable(),
    })
  ),
  map: z
    .object({
      watts: z.number(),
      computedFrom: z.object({
        metric: z.literal("best_60s"),
        activityId: z.union([z.number(), z.string()]),
        activityName: z.string(),
        activityDate: z.string(),
        daysAgo: z.number(),
      }),
    })
    .nullable(),
  mapZones: mapZonesSchema,
  mapWarning: z.string().optional(),
});

export const getCoachingContextTool = defineTool({
  name: "get_coaching_context",
  description:
    "Get a single snapshot of the athlete's current coaching state — profile " +
    "(FTP, LTHR, max/resting HR, weight, power/HR zones), today's fitness " +
    "(CTL, ATL, TSB, ramp rate), a wellness trend (default 7d, max 30d) " +
    "with subjective metrics (fatigue, soreness, motivation, mood, sleep), " +
    "and a derived MAP (Maximal Aerobic Power) value. " +
    "MAP is computed as the best-60s power from the most recent activity " +
    'whose name starts with "MAP ramp test" in the last 90 days. To exclude ' +
    'a botched test, rename the activity in Intervals.icu to include "(skip)". ' +
    "If no qualifying test is found, map is null and mapWarning explains. " +
    "Call this at session start to ground workout decisions in current state " +
    "rather than juggling get_athlete + get_wellness + get_fitness_summary " +
    "yourself. " +
    "Returns: { asOf, daysWindow, athlete, fitness, wellnessTrend, map, mapWarning? }.",
  schema: getCoachingContextSchema,
  annotations: READ_ONLY,
  outputSchema: getCoachingContextOutputSchema,
  handler: (services, args) =>
    services.coachingContext.getCoachingContext({ days: args.days }),
});

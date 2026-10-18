import { z } from "zod";
import { defineTool, READ_ONLY } from "./define.js";
import { dateString } from "./common.js";
import {
  MAX_SFT_RANGE_DAYS,
  SFT_BASELINE_DAYS,
  SFT_BASELINE_MIN_TESTS,
  SFT_MAX_CV,
  SFT_POWER_TOLERANCE_PCT,
  SFT_SPORT_TYPE_LIST,
  SFT_TREND_MIN_TESTS,
} from "../services/analysis/index.js";

const getSubmaxFatigueTestsSchema = z.object({
  oldest: dateString.describe(
    "First test date, YYYY-MM-DD. Baselines still reach " +
      `${SFT_BASELINE_DAYS} days before it.`
  ),
  newest: dateString.describe(
    "Last test date, YYYY-MM-DD, on or after oldest. The range spans at most " +
      `${MAX_SFT_RANGE_DAYS} days counting both ends: the activity list's cap ` +
      `less the ${SFT_BASELINE_DAYS}-day lookback.`
  ),
});

const getSubmaxFatigueTestsOutputSchema = z.object({
  oldest: z.string(),
  newest: z.string(),
  lookbackFrom: z.string(),
  tests: z.array(
    z.object({
      date: z.string(),
      activityId: z.string(),
      target: z.number(),
      averageWatts: z.number(),
      cv: z.number(),
      finalBpm: z.number(),
      efficiencyFactor: z.number(),
      hrrc: z.number().nullable(),
      rpe: z.number().nullable(),
      tteMins: z.number().nullable(),
      averageTemp: z.number().nullable(),
      indoor: z.boolean(),
      valid: z.boolean(),
      invalidReasons: z.array(z.string()),
      baseline: z.object({
        count: z.number(),
        meanBpm: z.number().nullable(),
        sdBpm: z.number().nullable(),
      }),
      deviationBpm: z.number().nullable(),
      deviationNote: z.string().optional(),
    })
  ),
  summary: z.object({
    count: z.number(),
    valid: z.number(),
    ignored: z.number(),
    indoor: z.number(),
    trendBpmPerWeek: z.number().nullable(),
    trendTarget: z.number().nullable(),
    trendTests: z.number(),
    trendNote: z.string().optional(),
  }),
});

export const getSubmaxFatigueTestsTool = defineTool({
  name: "get_submax_fatigue_tests",
  description:
    "The submaximal fatigue tests (SFT) Intervals.icu detected across a date " +
    "range — fixed power for a few minutes, read as end-of-test HR — one row " +
    `per non-ignored test on ${SFT_SPORT_TYPE_LIST}, oldest first, from one ` +
    "activity-list read (no streams). Ignored tests give no row and are " +
    "counted in summary.ignored. finalBpm is mean HR over the test's last " +
    "minute. efficiencyFactor is averageWatts / finalBpm, not the ride's " +
    "icu_efficiency_factor. hrrc null means Intervals.icu saw too little HR " +
    "drop after the test to measure one (the athlete kept riding), never a " +
    "recovery of 0. rpe (Intervals.icu's 1–10 scale) and tteMins (minutes " +
    "longer the athlete reckons the target could have been held) are what " +
    "the athlete logged in the test's dialog, null when unlogged. " +
    "averageTemp is the head unit's own sensor, °C. indoor is a VirtualRide " +
    "or a trainer ride. valid means comparable with the series: outdoor, a " +
    "power (not pace) test, " +
    `average power within ${SFT_POWER_TOLERANCE_PCT}% of target and CV ≤ ` +
    `${SFT_MAX_CV}; invalidReasons says which failed. baseline is the valid ` +
    `tests at the same target from ${SFT_BASELINE_DAYS} days before the test ` +
    "to the day before (meanBpm, sample sdBpm); deviationBpm is finalBpm − " +
    "meanBpm, null with a deviationNote when the test is invalid or the " +
    `baseline holds fewer than ${SFT_BASELINE_MIN_TESTS} tests. No flag ` +
    "threshold is applied — reading a deviation is coaching. " +
    "summary.trendBpmPerWeek is a Theil–Sen slope (median of pairwise " +
    "slopes) of finalBpm against date over the valid in-range tests at the " +
    `latest valid test's target (trendTarget), null with a note below ` +
    `${SFT_TREND_MIN_TESTS} tests; a note also appears when the range spans ` +
    "more than one target. " +
    "Returns: { oldest, newest, lookbackFrom, tests: [{ date, activityId, " +
    "target, averageWatts, cv, finalBpm, efficiencyFactor, hrrc, rpe, " +
    "tteMins, averageTemp, " +
    "indoor, valid, invalidReasons, baseline: { count, meanBpm, sdBpm }, " +
    "deviationBpm, deviationNote? }], summary: { count, valid, ignored, " +
    "indoor, trendBpmPerWeek, trendTarget, trendTests, trendNote? } }.",
  schema: getSubmaxFatigueTestsSchema,
  annotations: READ_ONLY,
  outputSchema: getSubmaxFatigueTestsOutputSchema,
  handler: (services, args) =>
    services.analysis.getSubmaxFatigueTests(args.oldest, args.newest),
});

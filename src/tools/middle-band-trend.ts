import { z } from "zod";
import { defineTool, READ_ONLY } from "./define.js";
import { dateString } from "./common.js";
import { SPORT_TYPES } from "../types.js";
import { MAX_TREND_WEEKS } from "../services/training-load/index.js";

const getMiddleBandTrendSchema = z.object({
  oldest: dateString.describe(
    "Any date in the first week, YYYY-MM-DD; snapped back to its Monday. " +
      `The range spans at most ${MAX_TREND_WEEKS} Monday-to-Sunday weeks once ` +
      "snapped — every power-recorded ride costs a stream fetch."
  ),
  newest: dateString.describe(
    "Any date in the last week, YYYY-MM-DD, on or after oldest; snapped " +
      `forward to its Sunday. At most ${MAX_TREND_WEEKS} weeks after snapping.`
  ),
  sport: z
    .enum(SPORT_TYPES)
    .optional()
    .describe(
      "Only activities of this type (e.g. Ride, VirtualRide). Omit to count " +
        "every power-recorded activity, as get_training_week_summary does."
    ),
});

const figuresShape = {
  seconds: z.number(),
  hours: z.number(),
  fractionOfPowerTime: z.number().nullable(),
  ftpRange: z.object({ min: z.number(), max: z.number() }).nullable(),
  note: z.string().optional(),
  excludedNoFtp: z.number(),
  rides: z.number(),
};

const getMiddleBandTrendOutputSchema = z.object({
  oldest: z.string(),
  newest: z.string(),
  sport: z.string().nullable(),
  band: z.object({ lowPctFtp: z.number(), highPctFtp: z.number() }),
  weeks: z.array(
    z.object({
      weekStart: z.string(),
      weekEnd: z.string(),
      ...figuresShape,
    })
  ),
  total: z.object(figuresShape),
});

export const getMiddleBandTrendTool = defineTool({
  name: "get_middle_band_trend",
  description:
    "Delivered middle-band time (76-106% FTP, tempo through threshold) per " +
    "Monday-to-Sunday week across a range, with a range total — the weekly " +
    "watch metric's trend across a block in one call. Each week's row is " +
    "exactly get_training_week_summary's middleBand for that week: bucketed " +
    "from recorded power streams, each ride against its own FTP (the ride's " +
    "icu_ftp, else the athlete's current), not from icu_zone_times. " +
    "ftpRange is the min/max FTP used and a note appears when a week spans an " +
    "FTP change; excludedNoFtp counts power rides with no FTP from any source; " +
    "rides counts the rides that contributed. A week with no power-recorded " +
    "ride reports zero seconds and fractionOfPowerTime null, never a missing " +
    "row. Range max " +
    MAX_TREND_WEEKS +
    " weeks. " +
    "Returns: { oldest, newest, sport, band: { lowPctFtp, highPctFtp }, " +
    "weeks: [{ weekStart, weekEnd, seconds, hours, fractionOfPowerTime, " +
    "ftpRange, note?, excludedNoFtp, rides }], total: { ... } }.",
  schema: getMiddleBandTrendSchema,
  annotations: READ_ONLY,
  outputSchema: getMiddleBandTrendOutputSchema,
  handler: (services, args) => services.trainingLoad.getMiddleBandTrend(args),
});

import type { Activity } from "../activities/index.js";
import { MAX_RANGE_DAYS } from "../activities/index.js";
import { daysBetween, shiftDate } from "../../shared/dates.js";
import { round } from "../../shared/round.js";

/** Cycling types a submaximal fatigue test is read from. */
export const SFT_SPORT_TYPES = [
  "Ride",
  "VirtualRide",
  "GravelRide",
  "MountainBikeRide",
] as const;

/** The same list as prose, for the Tool description to quote. */
export const SFT_SPORT_TYPE_LIST = SFT_SPORT_TYPES.join(", ");

/**
 * How far back a test's baseline reaches, in days before it. The fetch starts
 * this far before the range, so the first rows in range get a full baseline.
 */
export const SFT_BASELINE_DAYS = 28;

/** Fewest baseline tests a deviation is reported against — the season's six-reading rule. */
export const SFT_BASELINE_MIN_TESTS = 6;

/** Fewest tests a trend is fitted to. */
export const SFT_TREND_MIN_TESTS = 4;

/**
 * Comparability limits. Intervals.icu only detects tests inside the tolerances
 * stored on the test itself (±5%, CV 10), so re-checking those would always
 * pass; these are the coach's tighter bar for a reading that belongs in the
 * series.
 */
export const SFT_POWER_TOLERANCE_PCT = 2;
export const SFT_MAX_CV = 10;

/**
 * Longest range accepted: the activity list's cap less the lookback, so the
 * one list fetch, lookback included, stays inside it.
 */
export const MAX_SFT_RANGE_DAYS = MAX_RANGE_DAYS - SFT_BASELINE_DAYS;

export interface SftBaseline {
  count: number;
  meanBpm: number | null;
  /** Sample standard deviation; `null` below two tests. */
  sdBpm: number | null;
}

export interface SubmaxFatigueTestRow {
  date: string;
  activityId: string;
  target: number;
  averageWatts: number;
  cv: number;
  finalBpm: number;
  efficiencyFactor: number;
  /** HR recovery; `null` when no recovery window was captured. */
  hrrc: number | null;
  averageTemp: number | null;
  indoor: boolean;
  valid: boolean;
  invalidReasons: string[];
  baseline: SftBaseline;
  deviationBpm: number | null;
  deviationNote?: string;
}

export interface SubmaxFatigueSummary {
  count: number;
  valid: number;
  ignored: number;
  indoor: number;
  trendBpmPerWeek: number | null;
  /** The target the trend is fitted at: the latest valid test's. */
  trendTarget: number | null;
  /** Tests the trend is fitted to. */
  trendTests: number;
  trendNote?: string;
}

export interface SubmaxFatigueTestsResult {
  oldest: string;
  newest: string;
  /** Where the fetch started, so baselines reach before `oldest`. */
  lookbackFrom: string;
  tests: SubmaxFatigueTestRow[];
  summary: SubmaxFatigueSummary;
}

interface Detected {
  row: SubmaxFatigueTestRow;
  ignored: boolean;
}

const CYCLING = new Set<string>(SFT_SPORT_TYPES);

/**
 * Read the submaximal fatigue tests in `oldest..newest` from an activity list
 * that starts `SFT_BASELINE_DAYS` before `oldest`.
 */
export function readSubmaxFatigueTests(
  activities: Activity[],
  oldest: string,
  newest: string
): SubmaxFatigueTestsResult {
  const detected = activities
    .filter((a) => CYCLING.has(a.type) && a.submax_fatigue_test)
    .map(toDetected)
    .sort((a, b) => a.row.date.localeCompare(b.row.date));

  const series = detected.filter((d) => !d.ignored).map((d) => d.row);
  const valid = series.filter((r) => r.valid);
  for (const row of series) attachBaseline(row, valid);

  const inRange = (date: string) => date >= oldest && date <= newest;
  const tests = series.filter((r) => inRange(r.date));
  const validInRange = tests.filter((r) => r.valid);

  return {
    oldest,
    newest,
    lookbackFrom: shiftDate(oldest, -SFT_BASELINE_DAYS),
    tests,
    summary: {
      count: tests.length,
      valid: validInRange.length,
      ignored: detected.filter((d) => d.ignored && inRange(d.row.date)).length,
      indoor: tests.filter((r) => r.indoor).length,
      ...trend(validInRange),
    },
  };
}

function toDetected(activity: Activity): Detected {
  const test = activity.submax_fatigue_test!;
  const indoor = activity.type === "VirtualRide" || activity.trainer === true;
  const invalidReasons: string[] = [];
  if (indoor) invalidReasons.push("indoor");
  // Compared in watts × 100 so a test exactly on the limit is not pushed over
  // it by a float division.
  const offWatts = test.average_watts - test.target;
  if (
    Math.abs(offWatts) * 100 >
    SFT_POWER_TOLERANCE_PCT * Math.abs(test.target)
  ) {
    const pct = (Math.abs(offWatts) / test.target) * 100;
    invalidReasons.push(
      `power ${round(pct, 1)}% ${offWatts < 0 ? "under" : "over"} target ` +
        `(limit ${SFT_POWER_TOLERANCE_PCT}%)`
    );
  }
  if (test.cv > SFT_MAX_CV) {
    invalidReasons.push(`CV ${round(test.cv, 1)} over limit ${SFT_MAX_CV}`);
  }
  return {
    ignored: test.ignore === true,
    row: {
      date: activity.start_date_local.slice(0, 10),
      activityId: activity.id,
      target: test.target,
      averageWatts: test.average_watts,
      cv: round(test.cv, 2),
      finalBpm: test.final_bpm,
      efficiencyFactor: round(test.efficiency_factor, 2),
      // Intervals.icu writes hrrc 0 when it captured no recovery window; that
      // is "not measured", never a recovery of 0 bpm.
      hrrc: test.end_index_hrrc ? test.hrrc : null,
      averageTemp:
        typeof activity.average_temp === "number"
          ? round(activity.average_temp, 1)
          : null,
      indoor,
      valid: invalidReasons.length === 0,
      invalidReasons,
      baseline: { count: 0, meanBpm: null, sdBpm: null },
      deviationBpm: null,
    },
  };
}

/** Baseline: valid same-target tests from 28 days before to the day before. */
function attachBaseline(
  row: SubmaxFatigueTestRow,
  valid: SubmaxFatigueTestRow[]
): void {
  const bpms = valid
    .filter((v) => v.target === row.target)
    .filter((v) => {
      const ago = daysBetween(v.date, row.date);
      return ago >= 1 && ago <= SFT_BASELINE_DAYS;
    })
    .map((v) => v.finalBpm);
  const mean = bpms.length ? bpms.reduce((s, b) => s + b, 0) / bpms.length : 0;
  const sd =
    bpms.length >= 2
      ? Math.sqrt(
          bpms.reduce((s, b) => s + (b - mean) ** 2, 0) / (bpms.length - 1)
        )
      : null;
  row.baseline = {
    count: bpms.length,
    meanBpm: bpms.length ? round(mean, 1) : null,
    sdBpm: sd === null ? null : round(sd, 1),
  };
  if (!row.valid) {
    row.deviationNote = "Invalid test — not compared with its baseline.";
  } else if (bpms.length < SFT_BASELINE_MIN_TESTS) {
    row.deviationNote =
      `Baseline has ${bpms.length} valid ${row.target} W test(s) in the ` +
      `${SFT_BASELINE_DAYS} days before; ${SFT_BASELINE_MIN_TESTS} needed.`;
  } else {
    row.deviationBpm = round(row.finalBpm - mean, 1);
  }
}

/**
 * Theil–Sen slope of end-HR against date: the median of every pairwise slope,
 * so one bad morning moves it far less than it would a least-squares fit.
 */
function trend(
  valid: SubmaxFatigueTestRow[]
): Pick<
  SubmaxFatigueSummary,
  "trendBpmPerWeek" | "trendTarget" | "trendTests" | "trendNote"
> {
  if (!valid.length) {
    return {
      trendBpmPerWeek: null,
      trendTarget: null,
      trendTests: 0,
      trendNote: `No valid tests in range; ${SFT_TREND_MIN_TESTS} needed.`,
    };
  }
  const target = valid[valid.length - 1].target;
  const series = valid.filter((r) => r.target === target);
  const others = valid.length - series.length;
  const notes: string[] = [];
  if (others) {
    notes.push(
      `Range spans more than one target; ${others} valid test(s) at other ` +
        `targets left out of the trend.`
    );
  }
  const slopes: number[] = [];
  for (let i = 0; i < series.length; i++) {
    for (let j = i + 1; j < series.length; j++) {
      const days = daysBetween(series[i].date, series[j].date);
      if (days === 0) continue;
      slopes.push((series[j].finalBpm - series[i].finalBpm) / days);
    }
  }
  let trendBpmPerWeek: number | null = null;
  if (series.length < SFT_TREND_MIN_TESTS) {
    notes.push(
      `${series.length} valid ${target} W test(s) in range; ` +
        `${SFT_TREND_MIN_TESTS} needed for a trend.`
    );
  } else if (!slopes.length) {
    notes.push("Every test falls on one day; no trend.");
  } else {
    trendBpmPerWeek = round(median(slopes) * 7, 2);
  }
  return {
    trendBpmPerWeek,
    trendTarget: target,
    trendTests: series.length,
    ...(notes.length ? { trendNote: notes.join(" ") } : {}),
  };
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

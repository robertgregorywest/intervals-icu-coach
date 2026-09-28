import type { Activity, ActivityInterval } from "../activities/index.js";

export interface IntervalComparison {
  lapNumber: number;
  values: Array<{
    activityId: string;
    name?: string;
    date?: string;
    avg_watts?: number;
    max_watts?: number;
    avg_hr?: number;
    avg_cadence?: number;
    elapsed?: number;
  }>;
}

export interface IntervalSummary {
  activityId: string;
  name?: string;
  date?: string;
  intervalCount: number;
  avgPower: number | null;
  minPower: number | null;
  maxPower: number | null;
  powerRange: number | null;
  avgCadence: number | null;
  totalDuration: number;
}

export interface CompareIntervalsResult {
  intervals: IntervalComparison[];
  summaries: IntervalSummary[];
}

export interface IntervalFilterOptions {
  minPower?: number;
  targetDuration?: number;
  durationTolerance?: number;
}

export function compareIntervals(
  activities: Activity[],
  options: IntervalFilterOptions = {}
): CompareIntervalsResult {
  const activityIntervals = activities.map((a) => ({
    activity: a,
    intervals: filterIntervals(a.icu_intervals || [], options),
  }));

  const maxIntervals = Math.max(
    ...activityIntervals.map((a) => a.intervals.length)
  );

  const intervals: IntervalComparison[] = [];
  for (let i = 0; i < maxIntervals; i++) {
    intervals.push({
      lapNumber: i + 1,
      values: activityIntervals
        .filter((a) => a.intervals[i])
        .map((a) => ({
          activityId: a.activity.id,
          name: a.activity.name,
          date: a.activity.start_date_local,
          avg_watts: a.intervals[i].average_watts,
          max_watts: a.intervals[i].max_watts,
          avg_hr: a.intervals[i].average_heartrate,
          avg_cadence: a.intervals[i].average_cadence,
          elapsed: a.intervals[i].elapsed_time,
        })),
    });
  }

  const summaries = activityIntervals.map((a) =>
    buildSummary(a.activity, a.intervals)
  );

  return { intervals, summaries };
}

function filterIntervals(
  intervals: ActivityInterval[],
  options: IntervalFilterOptions
): ActivityInterval[] {
  let filtered = intervals;

  if (options.minPower !== undefined) {
    filtered = filtered.filter((i) => i.average_watts >= options.minPower!);
  }

  if (options.targetDuration !== undefined) {
    const tolerance = options.durationTolerance ?? 0.2;
    const min = options.targetDuration * (1 - tolerance);
    const max = options.targetDuration * (1 + tolerance);
    filtered = filtered.filter(
      (i) => i.elapsed_time >= min && i.elapsed_time <= max
    );
  }

  return filtered;
}

function buildSummary(
  activity: Activity,
  intervals: ActivityInterval[]
): IntervalSummary {
  const powers = intervals
    .map((i) => i.average_watts)
    .filter((p) => p != null && p > 0);
  const cadences = intervals
    .map((i) => i.average_cadence)
    .filter((c) => c != null && c > 0);

  const avgPower = powers.length
    ? Math.round(powers.reduce((s, v) => s + v, 0) / powers.length)
    : null;
  const minPower = powers.length ? Math.min(...powers) : null;
  const maxPower = powers.length ? Math.max(...powers) : null;
  const avgCadence = cadences.length
    ? Math.round(cadences.reduce((s, v) => s + v, 0) / cadences.length)
    : null;
  const totalDuration = intervals.reduce(
    (s, i) => s + (i.elapsed_time || 0),
    0
  );

  return {
    activityId: activity.id,
    name: activity.name,
    date: activity.start_date_local,
    intervalCount: intervals.length,
    avgPower,
    minPower,
    maxPower,
    powerRange:
      minPower != null && maxPower != null ? maxPower - minPower : null,
    avgCadence,
    totalDuration,
  };
}

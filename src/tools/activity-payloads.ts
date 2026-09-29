/**
 * Model-facing shapes of activity payloads. The raw Intervals.icu records are
 * too large to hand over whole: interval analyses carry ~70 fields per entry
 * and streams scale with ride length, so both are cut to a budget here.
 */

type IntervalProjection = {
  i: number;
  type?: unknown;
  label?: unknown;
  start?: unknown;
  dur?: unknown;
  avgW?: unknown;
  maxW?: unknown;
  hr?: unknown;
  cadence?: unknown;
  grp?: unknown;
};

type GroupProjection = {
  sig?: unknown;
  count?: unknown;
  dur?: unknown;
  avgW?: unknown;
  maxW?: unknown;
  hr?: unknown;
  cadence?: unknown;
};

// Replace the raw icu_intervals/icu_groups blobs with slim projections that keep
// the coaching signal: per-lap power/HR/cadence/duration, and the grouped rollup
// where repeated laps collapse into one entry with `count` (e.g. count:4 = a 4x2min
// block). `grp`/`sig` link a lap to its group. Other activity fields pass through.
export function compactIntervalAnalysis(
  activity: Record<string, unknown>,
  budget: number
): Record<string, unknown> {
  const rawIntervals =
    (activity.icu_intervals as Array<Record<string, unknown>>) ?? [];
  const rawGroups =
    (activity.icu_groups as Array<Record<string, unknown>>) ?? [];

  const intervals: IntervalProjection[] = rawIntervals.map((iv, i) => {
    const p: IntervalProjection = {
      i,
      type: iv.type,
      label: iv.label,
      start: iv.start_time,
      dur: iv.elapsed_time,
      avgW: iv.average_watts,
      maxW: iv.max_watts,
      hr: iv.average_heartrate,
      cadence: iv.average_cadence,
    };
    if (iv.group_id != null) p.grp = iv.group_id;
    return p;
  });

  const groups: GroupProjection[] = rawGroups.map((g) => ({
    sig: g.id,
    count: g.count,
    dur: g.elapsed_time,
    avgW: g.average_watts,
    maxW: g.max_watts,
    hr: g.average_heartrate,
    cadence: g.average_cadence,
  }));

  const rest: Record<string, unknown> = { ...activity };
  delete rest.icu_intervals;
  delete rest.icu_groups;

  let result: Record<string, unknown> = { ...rest, groups, intervals };
  // Safety net: projections are tiny, but if a pathological activity blows the
  // budget, drop the per-lap detail first — groups + interval_summary still
  // convey the structure.
  if (JSON.stringify(result).length > budget) {
    result = { ...rest, groups, intervals_omitted: intervals.length };
  }
  return result;
}

type PackedStreams = {
  samples: number;
  original_samples: number;
  downsampled: boolean;
  stride: number;
  streams: Record<string, unknown>;
};

// Downsample by index stride so the full ride stays represented at lower
// resolution, rather than truncating the payload and losing the tail.
export function packStreams(
  streams: Record<string, unknown>,
  budget: number
): PackedStreams {
  const original = maxArrayLength(streams);
  const fits = (s: Record<string, unknown>) =>
    JSON.stringify({ streams: s }).length <= budget;

  let stride = 1;
  let out = streams;
  if (!fits(streams)) {
    stride = Math.max(
      2,
      Math.ceil(JSON.stringify({ streams }).length / budget)
    );
    out = downsample(streams, stride);
    while (!fits(out)) {
      stride += 1;
      out = downsample(streams, stride);
    }
  }

  return {
    samples: maxArrayLength(out),
    original_samples: original,
    downsampled: stride > 1,
    stride,
    streams: out,
  };
}

function downsample(
  streams: Record<string, unknown>,
  stride: number
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(streams)) {
    out[key] = Array.isArray(value)
      ? value.filter((_, i) => i % stride === 0)
      : value;
  }
  return out;
}

function maxArrayLength(streams: Record<string, unknown>): number {
  let max = 0;
  for (const value of Object.values(streams)) {
    if (Array.isArray(value)) max = Math.max(max, value.length);
  }
  return max;
}

export function detectStravaStub(
  activity: Record<string, unknown>
): Record<string, unknown> | null {
  const note = activity._note;
  if (typeof note === "string" && /strava/i.test(note)) {
    return {
      _strava_limitation: true,
      _note: note,
      id: activity.id,
      source: activity.source,
      start_date_local: activity.start_date_local,
      message:
        "This activity was synced from Strava and cannot be retrieved via the Intervals.icu API " +
        "(Strava API terms prohibit third-party access). " +
        "Only activities recorded directly by Intervals.icu-compatible devices are available.",
    };
  }
  return null;
}

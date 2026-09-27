/** The 5s, 1min and 5min peaks off a power curve; `null` where it has none. */
export interface PeakSet {
  p5s: number | null;
  p60: number | null;
  p5min: number | null;
}

// Intervals.icu power-curves-ext response is either an array of points
// `[{ secs, value, activity_id }, ...]` or an envelope `{ list: [{ secs:[],
// watts:[], values:[], ... }] }`. Handle both shapes defensively.
export function extractPeaks(raw: unknown): PeakSet {
  const out: PeakSet = { p5s: null, p60: null, p5min: null };
  if (!raw) return out;

  if (Array.isArray(raw)) {
    for (const p of raw as Array<Record<string, unknown>>) {
      const secs = typeof p.secs === "number" ? p.secs : null;
      const value =
        typeof p.value === "number"
          ? p.value
          : typeof p.watts === "number"
            ? (p.watts as number)
            : null;
      if (secs == null || value == null) continue;
      if (secs === 5) out.p5s = value;
      else if (secs === 60) out.p60 = value;
      else if (secs === 300) out.p5min = value;
    }
    return out;
  }

  const obj = raw as Record<string, unknown>;
  const list = obj.list ?? obj.points;
  if (Array.isArray(list) && list.length) {
    const first = list[0] as Record<string, unknown>;
    const secs = first.secs as number[] | undefined;
    const watts = (first.watts ?? first.values) as number[] | undefined;
    if (Array.isArray(secs) && Array.isArray(watts)) {
      for (let i = 0; i < secs.length; i++) {
        if (secs[i] === 5) out.p5s = watts[i] ?? out.p5s;
        else if (secs[i] === 60) out.p60 = watts[i] ?? out.p60;
        else if (secs[i] === 300) out.p5min = watts[i] ?? out.p5min;
      }
    }
  }
  return out;
}

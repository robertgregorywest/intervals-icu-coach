/**
 * Reading a stream over an arbitrary time window.
 *
 * Lap boundaries land at 16.26 s, 32.69 s and so on — never on a sample. The
 * stream is treated as piecewise-constant over each sample's own interval and
 * averaged by overlap, so a sample straddling a boundary contributes to both
 * adjacent laps in proportion. Snapping to the nearest sample instead would
 * move a boundary by up to half a sampling interval, which is the same order as
 * the whole alignment uncertainty and would be spent for nothing.
 */

/** A stream paired with the time base its samples sit on. */
export interface TimedStream {
  times: number[];
  /** Nulls are dropouts, skipped rather than read as zero. */
  values: Array<number | null>;
}

/**
 * Time-weighted mean of `stream` over `[start, end)`.
 *
 * Returns `undefined` when the window carries no usable sample — which the
 * caller must report as absent rather than as zero.
 */
export function windowMean(
  stream: TimedStream,
  start: number,
  end: number
): number | undefined {
  if (!(end > start)) return undefined;
  const { times, values } = stream;
  if (times.length === 0) return undefined;

  let weighted = 0;
  let covered = 0;

  // The offset search evaluates this thousands of times per run, so it seeks to
  // the first sample that can overlap rather than scanning from the top.
  // Each sample holds until the next one; the last holds for one second.
  for (let i = firstSampleAtOrBefore(times, start); i < times.length; i++) {
    const from = times[i];
    const to = i + 1 < times.length ? times[i + 1] : times[i] + 1;
    if (to <= start) continue;
    if (from >= end) break;

    const value = values[i];
    if (value === undefined || value === null || !Number.isFinite(value)) {
      continue;
    }

    const overlap = Math.min(to, end) - Math.max(from, start);
    if (overlap <= 0) continue;
    weighted += value * overlap;
    covered += overlap;
  }

  if (covered <= 0) return undefined;
  return weighted / covered;
}

/**
 * Index of the last sample starting at or before `t`, or 0. Starting one sample
 * early is what lets a window pick up the sample it begins part-way through.
 */
function firstSampleAtOrBefore(times: number[], t: number): number {
  let lo = 0;
  let hi = times.length - 1;
  let found = 0;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (times[mid] <= t) {
      found = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return found;
}

/** Median gap between samples — the resolution the streams actually carry. */
export function medianSampleInterval(times: number[]): number | undefined {
  if (times.length < 2) return undefined;
  const deltas: number[] = [];
  for (let i = 1; i < times.length; i++) {
    const d = times[i] - times[i - 1];
    if (d > 0) deltas.push(d);
  }
  if (deltas.length === 0) return undefined;
  deltas.sort((a, b) => a - b);
  const mid = deltas.length >> 1;
  return deltas.length % 2 ? deltas[mid] : (deltas[mid - 1] + deltas[mid]) / 2;
}

/**
 * Some activities return no `time` stream at all, in which case the samples are
 * one per second by position. A supplied time base is used as given.
 */
export function normalizeTimes(
  time: number[] | undefined,
  length: number
): number[] {
  if (time?.length === length) return time;
  return Array.from({ length }, (_, i) => i);
}

/** Value at the given quantile of the positive entries, or `undefined`. */
export function positiveQuantile(
  values: number[],
  quantile: number
): number | undefined {
  const positive = values.filter((v) => Number.isFinite(v) && v > 0);
  if (positive.length === 0) return undefined;
  positive.sort((a, b) => a - b);
  const index = Math.min(
    positive.length - 1,
    Math.max(0, Math.round(quantile * (positive.length - 1)))
  );
  return positive[index];
}

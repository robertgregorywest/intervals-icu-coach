import type {
  AlignmentBasis,
  DeliveredInterval,
  FlatPlannedStep,
} from "./types.js";

/**
 * Beyond this relative duration difference a pairing is not credible and is not
 * offered to the alignment at all. A prescribed 12-minute effort will not be
 * recognised in a 4-minute lap however convenient that pairing would be.
 *
 * Calibrated against real paired sessions (see the change's validation notes):
 * head units round and athletes overshoot, so genuine steps land within a few
 * percent; 40% is far outside that and comfortably inside the gap to the next
 * structurally different step.
 */
export const MAX_RELATIVE_DURATION_DIFF = 0.4;

/**
 * Minimum fraction of planned steps that must be matched before a partial
 * alignment is reported as `duration` rather than abandoned as `none`.
 *
 * Counted per step, deliberately not weighted by planned duration. Weighting by
 * duration lets one long block carry a session that otherwise did not match:
 * real session i168337217 prescribes 600/3600/300s and was auto-lapped
 * 1728/264/2485s — one continuous ride split arbitrarily. By step count 1 of 3
 * matches (0.33) and the session is correctly refused; by duration the single
 * 3600s block alone scores 0.80, which would report it as delivered by a 2485s
 * chunk and label the first 1728s "unplanned work". Counting steps keeps the
 * conservative reading.
 */
export const CONFIDENCE_FLOOR = 0.5;

/**
 * Two candidate intervals whose scores sit within this margin are treated as
 * indistinguishable, and the match is dropped rather than picked arbitrarily.
 */
export const AMBIGUITY_MARGIN = 0.1;

export interface AlignmentPair {
  plannedIndex: number;
  intervalIndex: number;
  score: number;
}

export interface AlignmentResult {
  basis: AlignmentBasis;
  pairs: AlignmentPair[];
  matchedFraction: number;
  /** Indices of planned steps demoted by the ambiguity check. */
  ambiguous: number[];
}

/**
 * Duration agreement between a planned step and a recorded interval, in [0, 1],
 * or `null` when the pair is not a credible match at all.
 *
 * Deliberately reads nothing but duration. Scoring on power would pair every
 * prescribed wattage with whichever interval came closest to it, and the tool
 * would report near-perfect compliance for any session — the exact failure this
 * comparison exists to prevent.
 */
export function matchScore(
  planned: FlatPlannedStep,
  interval: DeliveredInterval
): number | null {
  const p = planned.durationSeconds;
  const a = interval.durationSeconds;
  // Distance-based or duration-less steps have nothing to align on.
  if (!p || p <= 0 || !a || a <= 0) return null;

  const relDiff = Math.abs(p - a) / Math.max(p, a);
  if (relDiff > MAX_RELATIVE_DURATION_DIFF) return null;
  return 1 - relDiff / MAX_RELATIVE_DURATION_DIFF;
}

/**
 * Pair planned steps to recorded intervals with an order-preserving dynamic
 * program that allows gaps on both sides.
 *
 * Order preservation is the structural assumption doing the real work: a
 * session is ridden front to back, so a credible pairing never crosses. Gaps
 * are free, which lets an interleaved auto-lap or an unridden step be skipped
 * without cascading into the rest of the alignment; a pair must clear the
 * duration floor to be offered at all.
 */
export function alignSteps(
  planned: FlatPlannedStep[],
  intervals: DeliveredInterval[]
): AlignmentResult {
  const n = planned.length;
  const m = intervals.length;

  if (n === 0 || m === 0) {
    return { basis: "none", pairs: [], matchedFraction: 0, ambiguous: [] };
  }

  // dp[i][j] — best total score aligning the first i steps with the first j
  // intervals. Gaps cost nothing, so the optimum maximises pairing quality.
  const dp: number[][] = Array.from({ length: n + 1 }, () =>
    new Array<number>(m + 1).fill(0)
  );

  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      const skipPlanned = dp[i - 1][j];
      const skipInterval = dp[i][j - 1];
      let best = Math.max(skipPlanned, skipInterval);

      const s = matchScore(planned[i - 1], intervals[j - 1]);
      if (s !== null) {
        const paired = dp[i - 1][j - 1] + s;
        if (paired > best) best = paired;
      }
      dp[i][j] = best;
    }
  }

  // Traceback. Prefer the diagonal on ties so an equally-scoring alignment
  // resolves to the sequential reading rather than to a gap.
  const pairs: AlignmentPair[] = [];
  let i = n;
  let j = m;
  while (i > 0 && j > 0) {
    const s = matchScore(planned[i - 1], intervals[j - 1]);
    if (s !== null && dp[i][j] === dp[i - 1][j - 1] + s) {
      pairs.push({
        plannedIndex: planned[i - 1].index,
        intervalIndex: intervals[j - 1].index,
        score: s,
      });
      i--;
      j--;
    } else if (dp[i][j] === dp[i - 1][j]) {
      i--;
    } else {
      j--;
    }
  }
  pairs.reverse();

  const ambiguous = findAmbiguous(planned, intervals, pairs);
  const kept = pairs.filter((p) => !ambiguous.includes(p.plannedIndex));
  const matchedFraction = kept.length / n;

  const complete = kept.length === n && kept.length === m;
  let basis: AlignmentBasis;
  if (complete) basis = "sequential";
  else if (matchedFraction >= CONFIDENCE_FLOOR) basis = "duration";
  else basis = "none";

  return {
    basis,
    pairs: basis === "none" ? [] : kept,
    matchedFraction,
    ambiguous,
  };
}

/**
 * Flag matches that a rival candidate could equally well explain.
 *
 * A complete, gapless alignment needs no such check: order pins every step, and
 * neighbouring intervals of identical duration (a 30/30 block, say) are
 * distinguished by position alone. Ambiguity only becomes real where gaps give
 * the alignment slack — so the rivals considered are the *unmatched* intervals
 * inside the window bounded by the neighbouring matches.
 */
function findAmbiguous(
  planned: FlatPlannedStep[],
  intervals: DeliveredInterval[],
  pairs: AlignmentPair[]
): number[] {
  if (pairs.length === planned.length && pairs.length === intervals.length) {
    return [];
  }

  const matchedIntervals = new Set(pairs.map((p) => p.intervalIndex));
  const byIndex = new Map(planned.map((s) => [s.index, s]));
  const ambiguous: number[] = [];

  pairs.forEach((pair, k) => {
    const step = byIndex.get(pair.plannedIndex);
    if (!step) return;

    // Order preservation bounds where an alternative could legally sit.
    const lower = k > 0 ? pairs[k - 1].intervalIndex : -1;
    const upper =
      k < pairs.length - 1 ? pairs[k + 1].intervalIndex : intervals.length;

    for (const candidate of intervals) {
      if (candidate.index <= lower || candidate.index >= upper) continue;
      if (candidate.index === pair.intervalIndex) continue;
      if (matchedIntervals.has(candidate.index)) continue;

      const rival = matchScore(step, candidate);
      if (rival === null) continue;
      if (Math.abs(rival - pair.score) <= AMBIGUITY_MARGIN) {
        ambiguous.push(pair.plannedIndex);
        return;
      }
    }
  });

  return ambiguous;
}

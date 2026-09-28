import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  alignSteps,
  matchScore,
  MAX_RELATIVE_DURATION_DIFF,
  CONFIDENCE_FLOOR,
} from "../../../../src/services/execution-review/steps/align.js";
import { readPlannedSteps } from "../../../helpers/planned-steps.js";
import { toDeliveredIntervals } from "../../../../src/services/execution-review/steps/review.js";
import type { DeliveredInterval } from "../../../../src/services/execution-review/steps/types.js";

function fixture(name: string) {
  const path = fileURLToPath(
    new URL(`../../../fixtures/session-review/${name}.json`, import.meta.url)
  );
  return JSON.parse(readFileSync(path, "utf8"));
}

function load(name: string) {
  const { event, activity } = fixture(name);
  return {
    planned: readPlannedSteps(event?.workout_doc),
    intervals: toDeliveredIntervals(activity?.icu_intervals ?? []),
    event,
    activity,
  };
}

function interval(
  index: number,
  durationSeconds: number,
  averageWatts = 200
): DeliveredInterval {
  return { index, durationSeconds, averageWatts };
}

describe("matchScore", () => {
  it("scores an exact duration match at 1", () => {
    expect(
      matchScore(
        { index: 0, sourceIndex: 0, durationSeconds: 300 },
        interval(0, 300)
      )
    ).toBe(1);
  });

  it("refuses a pairing beyond the duration floor", () => {
    // 720s prescribed against a 240s lap — a third of the length.
    expect(
      matchScore(
        { index: 0, sourceIndex: 0, durationSeconds: 720 },
        interval(0, 240)
      )
    ).toBeNull();
  });

  it("refuses a step with no duration to align on", () => {
    expect(
      matchScore({ index: 0, sourceIndex: 0 }, interval(0, 300))
    ).toBeNull();
  });

  it("falls to zero exactly at the floor", () => {
    const planned = { index: 0, sourceIndex: 0, durationSeconds: 100 };
    const atFloor = 100 * (1 - MAX_RELATIVE_DURATION_DIFF);
    expect(matchScore(planned, interval(0, atFloor))).toBeCloseTo(
      1 - (100 - atFloor) / 100 / MAX_RELATIVE_DURATION_DIFF,
      6
    );
  });
});

describe("alignSteps", () => {
  it("reports `sequential` for a real 1:1 session", () => {
    // Event 123780516 (Sweet Spot 3x12) against activity i170317118.
    const { planned, intervals } = load("sweet-spot-3x12");
    expect(planned.length).toBe(8);
    expect(intervals.length).toBe(8);

    const result = alignSteps(planned, intervals);

    expect(result.basis).toBe("sequential");
    expect(result.matchedFraction).toBe(1);
    expect(result.pairs.map((p) => p.intervalIndex)).toEqual([
      0, 1, 2, 3, 4, 5, 6, 7,
    ]);
  });

  it("reports `sequential` for a single-step session", () => {
    const { planned, intervals } = load("easy-spin");
    const result = alignSteps(planned, intervals);

    expect(result.basis).toBe("sequential");
    expect(result.pairs).toHaveLength(1);
  });

  it("declines to align 9 planned steps against 3 coarse laps", () => {
    // Event 123780543 against activity i171371339 — the trainer ride whose
    // auto-detected laps collapsed the session. Only one lap plausibly matches
    // a planned step, which is below the confidence floor.
    const { planned, intervals } = load("track-session");
    expect(planned.length).toBe(9);
    expect(intervals.length).toBe(3);

    const result = alignSteps(planned, intervals);

    expect(result.basis).toBe("none");
    expect(result.pairs).toEqual([]);
    expect(result.matchedFraction).toBeLessThan(0.5);
  });

  it("reports `duration` when most steps match but structure differs", () => {
    const planned = readPlannedSteps({
      steps: [
        { duration: 600, power: { units: "w", value: 160 } },
        { duration: 300, power: { units: "w", value: 280 } },
        { duration: 120, power: { units: "w", value: 150 } },
        { duration: 300, power: { units: "w", value: 280 } },
        { duration: 600, power: { units: "w", value: 140 } },
      ],
    });
    // An extra auto-lap interleaved in the middle, and one work step missing.
    const intervals = [
      interval(0, 600),
      interval(1, 300),
      interval(2, 45), // stray auto-lap
      interval(3, 120),
      interval(4, 300),
      interval(5, 600),
    ];

    const result = alignSteps(planned, intervals);

    expect(result.basis).toBe("duration");
    expect(result.pairs).toHaveLength(5);
    // The stray lap is skipped rather than absorbed into a planned step.
    expect(result.pairs.map((p) => p.intervalIndex)).toEqual([0, 1, 3, 4, 5]);
  });

  it("returns `none` when nothing corresponds", () => {
    const planned = readPlannedSteps({
      steps: [
        { duration: 600, power: { units: "w", value: 160 } },
        { duration: 720, power: { units: "w", value: 280 } },
        { duration: 600, power: { units: "w", value: 140 } },
      ],
    });
    const intervals = [interval(0, 45), interval(1, 30), interval(2, 20)];

    const result = alignSteps(planned, intervals);

    expect(result.basis).toBe("none");
    expect(result.pairs).toEqual([]);
  });

  it("preserves order — it never crosses pairings", () => {
    const planned = readPlannedSteps({
      steps: [{ duration: 300 }, { duration: 600 }],
    });
    // The 600s lap comes first, so only one of the two can legally pair.
    const intervals = [interval(0, 600), interval(1, 300)];

    const result = alignSteps(planned, intervals);

    for (let k = 1; k < result.pairs.length; k++) {
      expect(result.pairs[k].intervalIndex).toBeGreaterThan(
        result.pairs[k - 1].intervalIndex
      );
      expect(result.pairs[k].plannedIndex).toBeGreaterThan(
        result.pairs[k - 1].plannedIndex
      );
    }
  });

  it("drops a match an unmatched neighbour explains equally well", () => {
    // Two identical 300s laps sit where one 300s step is prescribed. Order
    // cannot separate them and the alignment is not complete, so the step is
    // reported unmatched rather than pinned to an arbitrary one.
    const planned = readPlannedSteps({
      steps: [{ duration: 900 }, { duration: 300 }, { duration: 900 }],
    });
    const intervals = [
      interval(0, 900),
      interval(1, 300),
      interval(2, 300),
      interval(3, 900),
    ];

    const result = alignSteps(planned, intervals);

    expect(result.ambiguous).toContain(1);
    expect(result.pairs.map((p) => p.plannedIndex)).not.toContain(1);
    // The unambiguous steps either side still align.
    expect(result.pairs.map((p) => p.plannedIndex)).toEqual([0, 2]);
  });

  it("does not demote identical steps in a complete alignment", () => {
    // A 30/30 block: every work lap is identical and every recovery is
    // identical, but a gapless 1:1 alignment is pinned by order alone.
    const planned = readPlannedSteps({
      steps: [
        {
          reps: 4,
          steps: [
            { duration: 30, power: { units: "w", value: 375 } },
            { duration: 30, power: { units: "w", value: 190 } },
          ],
        },
      ],
    });
    const intervals = Array.from({ length: 8 }, (_, k) => interval(k, 30));

    const result = alignSteps(planned, intervals);

    expect(result.basis).toBe("sequential");
    expect(result.ambiguous).toEqual([]);
    expect(result.pairs).toHaveLength(8);
  });

  it("refuses a continuous ride the detector split arbitrarily", () => {
    // Real session i168337217: a 600/3600/300s Z2 plan auto-lapped as
    // 1728/264/2485s. Only one planned step has a legal candidate and the two
    // possible pairings cross, so at most one survives — 1 of 3, below the
    // floor. Counting steps rather than weighting by duration is what keeps
    // this a refusal: the 3600s block alone is 80% of planned time, so a
    // duration-weighted floor would clear 0.5 and report the main block as
    // delivered by the 2485s chunk.
    const planned = readPlannedSteps({
      steps: [{ duration: 600 }, { duration: 3600 }, { duration: 300 }],
    });
    const intervals = [interval(0, 1728), interval(1, 264), interval(2, 2485)];

    const result = alignSteps(planned, intervals);

    expect(result.basis).toBe("none");
    expect(result.pairs).toEqual([]);
    expect(result.matchedFraction).toBeLessThan(CONFIDENCE_FLOOR);
  });

  it("returns `none` when either side is empty", () => {
    const { planned } = load("sweet-spot-3x12");
    expect(alignSteps(planned, []).basis).toBe("none");
    expect(alignSteps([], [interval(0, 300)]).basis).toBe("none");
  });
});

describe("alignment independence from power", () => {
  it("is unchanged when average power is permuted across intervals", () => {
    const { planned, intervals } = load("sweet-spot-3x12");

    const baseline = alignSteps(planned, intervals);

    // Reverse every power reading — the ride now looks nothing like the plan,
    // but the *shape* is identical, so the pairing must not move.
    const powers = intervals.map((iv) => iv.averageWatts).reverse();
    const permuted = intervals.map((iv, k) => ({
      ...iv,
      averageWatts: powers[k],
    }));

    const shuffled = alignSteps(planned, permuted);

    expect(shuffled.basis).toBe(baseline.basis);
    expect(shuffled.pairs).toEqual(baseline.pairs);
  });

  it("is unchanged when power is removed entirely", () => {
    const { planned, intervals } = load("sweet-spot-3x12");
    const baseline = alignSteps(planned, intervals);

    const stripped = intervals.map((iv) => ({
      ...iv,
      averageWatts: undefined,
    }));

    expect(alignSteps(planned, stripped).pairs).toEqual(baseline.pairs);
  });
});

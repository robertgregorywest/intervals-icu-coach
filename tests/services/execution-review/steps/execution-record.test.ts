import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  intervalsApis,
  routedFetch as routed,
  type RoutedFetch,
} from "../../../helpers/intervals-fixture.js";
import { ExecutionReview } from "../../../../src/services/execution-review/execution-review.js";
import {
  executionCandidates,
  lapsToDeliveredIntervals,
} from "../../../../src/services/execution-review/steps/delivered.js";
import type { Activity } from "../../../../src/services/activities/types.js";
import type { FitLap } from "../../../../src/services/activities/fit-laps.js";

function fixturePath(name: string) {
  return fileURLToPath(
    new URL(`../../../fixtures/session-review/${name}`, import.meta.url)
  );
}

/**
 * The 2026-08-06 pursuit session, the case this whole path exists for.
 *
 * The device lapped all 17 prescribed steps. Intervals.icu re-detected the
 * activity into 18 intervals that move the rep boundaries: rep 2 is swallowed
 * whole into a 418s block, and 22s is clipped off the front of rep 3, which
 * inflates its average from 346 W to 387 W. Reviewing against the detected
 * intervals therefore reports the opposite session to the one that was ridden.
 */
function pursuitFixture() {
  const { activity, event } = JSON.parse(
    readFileSync(fixturePath("pursuit-race-pace.json"), "utf8")
  );
  const fit = new Uint8Array(
    readFileSync(fixturePath("pursuit-race-pace.fit"))
  );
  return { activity, event, fit };
}

function build(fetchFn: RoutedFetch) {
  return new ExecutionReview(intervalsApis(fetchFn));
}

/** The four race-pace reps, in order, as the review reported them. */
function reps(
  steps: Array<{ label?: string; delivered?: { averageWatts?: number } }>
) {
  return steps
    .filter((s) => s.label?.startsWith("Race pace"))
    .map((s) => s.delivered?.averageWatts ?? null);
}

describe("step lens — reads the device's laps", () => {
  it("reports the reps that were actually ridden, not the re-detected ones", async () => {
    const { activity, event, fit } = pursuitFixture();
    const review = build(
      routed([
        [/\/activity\/[^/]+\/file$/, fit],
        [/\/activity\//, activity],
        [/\/events\//, event],
      ])
    );

    const result = await review.comparePlannedVsActual({
      activityId: activity.id,
    });

    expect(result.executionRecord).toBe("device-laps");
    // Every rep is accounted for, at the wattage the head unit recorded.
    expect(reps(result.steps)).toEqual([396, 393, 346, 350]);
  });

  it("catches the third-rep fade that the detected intervals hid", async () => {
    const { activity, event, fit } = pursuitFixture();
    const review = build(
      routed([
        [/\/activity\/[^/]+\/file$/, fit],
        [/\/activity\//, activity],
        [/\/events\//, event],
      ])
    );

    const result = await review.comparePlannedVsActual({
      activityId: activity.id,
    });

    const raceSteps = result.steps.filter((s) =>
      s.label?.startsWith("Race pace")
    );
    // Prescribed 390-410 W: two on the floor, then the decay.
    expect(raceSteps.map((s) => s.verdict)).toEqual([
      "on-target",
      "on-target",
      "under",
      "under",
    ]);
    // 346 W against a 390 W floor — a 44 W miss, not the 3 W the detected
    // segmentation reported.
    expect(raceSteps[2].deltas?.watts).toBe(-44);
  });

  it("stops inventing an over-target recovery from a merged interval", async () => {
    const { activity, event, fit } = pursuitFixture();
    const review = build(
      routed([
        [/\/activity\/[^/]+\/file$/, fit],
        [/\/activity\//, activity],
        [/\/events\//, event],
      ])
    );

    const result = await review.comparePlannedVsActual({
      activityId: activity.id,
    });

    // The detected reading paired the first recovery to a 418s/209 W block that
    // was really recovery + rep 2, and called it 59 W over target.
    const recoveries = result.steps.filter((s) => s.label === "Recovery");
    expect(recoveries.every((s) => s.verdict !== "over")).toBe(true);
    expect(recoveries[0].delivered?.durationSeconds).toBe(300);
    expect(recoveries[0].delivered?.averageWatts).toBe(99);
  });

  it("falls back to detected intervals when the upload has no laps to read", async () => {
    const { activity, event } = pursuitFixture();
    const review = build(
      routed([
        [/\/activity\/[^/]+\/file$/, null],
        [/\/activity\//, activity],
        [/\/events\//, event],
      ])
    );

    const result = await review.comparePlannedVsActual({
      activityId: activity.id,
    });

    expect(result.executionRecord).toBe("detected-intervals");
    // And it says so, rather than presenting the re-cut boundaries as fact.
    expect(result.executionRecordNote).toMatch(/edited or re-detected/);
    expect(result.executionRecordNote).toMatch(/17 lap\(s\) but 18 interval/);
  });

  it("fetches the lap file once, by GET", async () => {
    const { activity, event, fit } = pursuitFixture();
    const fetchFn = routed([
      [/\/activity\/[^/]+\/file$/, fit],
      [/\/activity\//, activity],
      [/\/events\//, event],
    ]);

    await build(fetchFn).comparePlannedVsActual({ activityId: activity.id });

    const fileCalls = fetchFn.mock.calls.filter(([u]) =>
      (u as string).endsWith("/file")
    );
    expect(fileCalls).toHaveLength(1);
    for (const [, init] of fetchFn.mock.calls) {
      expect((init as RequestInit | undefined)?.method ?? "GET").toBe("GET");
    }
  });
});

describe("executionCandidates", () => {
  const activity = (over: Partial<Activity> = {}) =>
    ({
      id: "i1",
      icu_intervals: [
        { type: "WORK", elapsed_time: 600, average_watts: 200 },
        { type: "WORK", elapsed_time: 600, average_watts: 250 },
      ],
      ...over,
    }) as unknown as Activity;

  const laps = (count: number): FitLap[] =>
    Array.from({ length: count }, (_, i) => ({
      index: i,
      startTimeSeconds: i * 600,
      durationSeconds: 600,
      averageWatts: 200,
    }));

  it("prefers the laps when the device recorded structure", () => {
    const candidates = executionCandidates(activity(), laps(4));

    expect(candidates.map((c) => c.source)).toEqual([
      "device-laps",
      "detected-intervals",
    ]);
  });

  it("ignores a single lap, which records no structure at all", () => {
    const candidates = executionCandidates(activity(), laps(1));

    expect(candidates.map((c) => c.source)).toEqual(["detected-intervals"]);
    // A ride that was never lapped is not a drift worth warning about.
    expect(candidates[0].note).toBeUndefined();
  });

  it("offers only the laps when no intervals were detected", () => {
    const candidates = executionCandidates(
      activity({ icu_intervals: [] }),
      laps(3)
    );

    expect(candidates.map((c) => c.source)).toEqual(["device-laps"]);
  });

  it("yields nothing when neither record exists", () => {
    expect(executionCandidates(activity({ icu_intervals: [] }), null)).toEqual(
      []
    );
  });

  it("warns when the detected intervals have been edited", () => {
    const candidates = executionCandidates(
      activity({ icu_intervals_edited: true }),
      null
    );

    expect(candidates[0].note).toMatch(/edited or re-detected/);
  });

  it("warns when the device's lap count disagrees with the detected count", () => {
    const candidates = executionCandidates(
      activity({ icu_lap_count: 9 }),
      null
    );

    expect(candidates[0].note).toMatch(/9 lap\(s\) but 2 interval\(s\)/);
  });

  it("stays quiet when the two records agree", () => {
    const candidates = executionCandidates(
      activity({ icu_lap_count: 2 }),
      null
    );

    expect(candidates[0].note).toBeUndefined();
  });
});

describe("lapsToDeliveredIntervals", () => {
  it("keeps wall-clock duration so a paused lap still fills its step", () => {
    const delivered = lapsToDeliveredIntervals([
      {
        index: 0,
        startTimeSeconds: 0,
        durationSeconds: 325,
        timerSeconds: 301,
        averageWatts: 98,
      },
    ]);

    expect(delivered[0].durationSeconds).toBe(325);
  });

  it("drops zero-length laps and re-indexes what remains", () => {
    const delivered = lapsToDeliveredIntervals([
      { index: 0, startTimeSeconds: 0, durationSeconds: 0 },
      {
        index: 1,
        startTimeSeconds: 0,
        durationSeconds: 120,
        averageWatts: 300,
      },
    ]);

    expect(delivered).toHaveLength(1);
    expect(delivered[0].averageWatts).toBe(300);
  });
});

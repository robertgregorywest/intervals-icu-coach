import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  judgeCadence,
  judgeStep,
  reviewSession,
  sliceStepWindow,
  toDeliveredIntervals,
  DEFAULT_TOLERANCE,
  type RawPowerStream,
} from "../../../../src/services/execution-review/steps/review.js";
import { normalizedPower } from "../../../../src/services/analysis/power.js";
import { flattenPlannedSteps } from "../../../../src/services/prescription/index.js";
import type {
  DeliveredInterval,
  FlatPlannedStep,
} from "../../../../src/services/execution-review/steps/types.js";

function fixture(name: string) {
  const path = fileURLToPath(
    new URL(`../../../fixtures/session-review/${name}.json`, import.meta.url)
  );
  return JSON.parse(readFileSync(path, "utf8"));
}

function step(over: Partial<FlatPlannedStep> = {}): FlatPlannedStep {
  return { index: 0, sourceIndex: 0, durationSeconds: 300, ...over };
}

function delivered(over: Partial<DeliveredInterval> = {}): DeliveredInterval {
  return { index: 0, durationSeconds: 300, averageWatts: 300, ...over };
}

describe("judgeStep — point targets", () => {
  it("is on-target just inside tolerance below", () => {
    // 375 W target, 5% tolerance -> 356.25 W floor.
    const r = judgeStep(
      step({ target: { watts: 375 } }),
      delivered({ averageWatts: 357 }),
      0.05
    );
    expect(r.verdict).toBe("on-target");
    expect(r.watts).toBe(-18);
  });

  it("is under just outside tolerance below", () => {
    const r = judgeStep(
      step({ target: { watts: 375 } }),
      delivered({ averageWatts: 356 }),
      0.05
    );
    expect(r.verdict).toBe("under");
    expect(r.watts).toBe(-19);
  });

  it("is on-target just inside tolerance above", () => {
    const r = judgeStep(
      step({ target: { watts: 375 } }),
      delivered({ averageWatts: 393 }),
      0.05
    );
    expect(r.verdict).toBe("on-target");
  });

  it("is over just outside tolerance above", () => {
    const r = judgeStep(
      step({ target: { watts: 375 } }),
      delivered({ averageWatts: 395 }),
      0.05
    );
    expect(r.verdict).toBe("over");
    expect(r.watts).toBe(20);
    expect(r.wattsFraction).toBeCloseTo(20 / 375, 4);
  });

  it("widens with a caller-supplied tolerance", () => {
    const under = judgeStep(
      step({ target: { watts: 375 } }),
      delivered({ averageWatts: 350 }),
      0.05
    );
    expect(under.verdict).toBe("under");

    const tolerated = judgeStep(
      step({ target: { watts: 375 } }),
      delivered({ averageWatts: 350 }),
      0.1
    );
    expect(tolerated.verdict).toBe("on-target");
  });
});

describe("judgeStep — band targets", () => {
  it("is on-target anywhere inside the band, with a zero delta", () => {
    const r = judgeStep(
      step({ target: { low: 255, high: 275 } }),
      delivered({ averageWatts: 258 }),
      DEFAULT_TOLERANCE
    );
    expect(r.verdict).toBe("on-target");
    expect(r.watts).toBe(0);
  });

  it("measures from the edge crossed when below the band", () => {
    const r = judgeStep(
      step({ target: { low: 255, high: 275 } }),
      delivered({ averageWatts: 220 }),
      DEFAULT_TOLERANCE
    );
    expect(r.verdict).toBe("under");
    expect(r.watts).toBe(-35);
  });

  it("judges a ramp against its midpoint, not its ends", () => {
    const ramp = { low: 130, high: 220, ramp: true };

    // Sitting at the bottom of the ramp is "in range" but is not on target.
    expect(
      judgeStep(step({ target: ramp }), delivered({ averageWatts: 135 }), 0.05)
        .verdict
    ).toBe("under");

    // The prescribed average is 175 W.
    expect(
      judgeStep(step({ target: ramp }), delivered({ averageWatts: 176 }), 0.05)
        .verdict
    ).toBe("on-target");

    expect(
      judgeStep(step({ target: ramp }), delivered({ averageWatts: 215 }), 0.05)
        .verdict
    ).toBe("over");
  });

  it("still treats a plain band as an acceptable range", () => {
    // Same numbers, no ramp flag: anywhere inside is on target.
    expect(
      judgeStep(
        step({ target: { low: 130, high: 220 } }),
        delivered({ averageWatts: 135 }),
        0.05
      ).verdict
    ).toBe("on-target");
  });

  it("does not widen a band by the tolerance", () => {
    // 244 W against a prescribed 255-275 W block is a real under-delivery.
    // A band already states the spread the coach accepts; granting a further
    // 5% would report this on-target and hide the rep-1 shortfall.
    const r = judgeStep(
      step({ target: { low: 255, high: 275 } }),
      delivered({ averageWatts: 244 }),
      DEFAULT_TOLERANCE
    );
    expect(r.verdict).toBe("under");
    expect(r.watts).toBe(-11);

    // Even a very loose tolerance leaves the band's own edges intact.
    expect(
      judgeStep(
        step({ target: { low: 255, high: 275 } }),
        delivered({ averageWatts: 244 }),
        0.5
      ).verdict
    ).toBe("under");
  });

  it("measures from the edge crossed when above the band", () => {
    const r = judgeStep(
      step({ target: { low: 255, high: 275 } }),
      delivered({ averageWatts: 320 }),
      DEFAULT_TOLERANCE
    );
    expect(r.verdict).toBe("over");
    expect(r.watts).toBe(45);
  });
});

describe("judgeStep — duration and missing data", () => {
  it("reports not-attempted when the step was cut short", () => {
    const r = judgeStep(
      step({ durationSeconds: 300, target: { watts: 375 } }),
      delivered({ durationSeconds: 120, averageWatts: 90 }),
      DEFAULT_TOLERANCE
    );
    expect(r.verdict).toBe("not-attempted");
  });

  it("checks duration before power, so an abandoned step is not a power miss", () => {
    const r = judgeStep(
      step({ durationSeconds: 300, target: { watts: 375 } }),
      // On target for the 20s it lasted — but it did not last.
      delivered({ durationSeconds: 20, averageWatts: 375 }),
      DEFAULT_TOLERANCE
    );
    expect(r.verdict).toBe("not-attempted");
  });

  it("judges a step delivered just above the abandonment threshold", () => {
    const r = judgeStep(
      step({ durationSeconds: 300, target: { watts: 375 } }),
      delivered({ durationSeconds: 151, averageWatts: 375 }),
      DEFAULT_TOLERANCE
    );
    expect(r.verdict).toBe("on-target");
  });

  it("refuses to judge an unresolved target", () => {
    const r = judgeStep(
      step({ targetUnresolved: "percent-of-FTP target but no FTP" }),
      delivered(),
      DEFAULT_TOLERANCE
    );
    expect(r.verdict).toBe("unmatched");
    expect(r.note).toMatch(/no FTP/);
  });

  it("refuses to judge an interval with no power recorded", () => {
    const r = judgeStep(
      step({ target: { watts: 375 } }),
      delivered({ averageWatts: undefined }),
      DEFAULT_TOLERANCE
    );
    expect(r.verdict).toBe("unmatched");
    expect(r.note).toMatch(/no power recorded/);
  });
});

describe("judgeStep — verdict basis", () => {
  const longBand = { low: 300, high: 350 };

  it("judges a long band step on normalized power when it resolves", () => {
    // Average watts (250) is under the band; normalized power (330) is inside it.
    const r = judgeStep(
      step({ durationSeconds: 600, target: longBand }),
      delivered({ durationSeconds: 600, averageWatts: 250 }),
      DEFAULT_TOLERANCE,
      330
    );
    expect(r.verdictBasis).toBe("normalized-power");
    expect(r.verdict).toBe("on-target");
    expect(r.watts).toBe(0);
  });

  it("falls back to average power when normalized power did not resolve", () => {
    const r = judgeStep(
      step({ durationSeconds: 600, target: longBand }),
      delivered({ durationSeconds: 600, averageWatts: 250 }),
      DEFAULT_TOLERANCE
      // normalizedWatts omitted — never resolved.
    );
    expect(r.verdictBasis).toBe("normalized-power-fallback");
    expect(r.verdict).toBe("under");
    expect(r.watts).toBe(-50);
  });

  it("stays on average power for a band step at or under the duration threshold", () => {
    const r = judgeStep(
      step({ durationSeconds: 300, target: longBand }),
      delivered({ durationSeconds: 300, averageWatts: 250 }),
      DEFAULT_TOLERANCE,
      330 // supplied but must be ignored — step is not long enough to qualify.
    );
    expect(r.verdictBasis).toBe("average-watts");
    expect(r.verdict).toBe("under");
    expect(r.watts).toBe(-50);
  });

  it("stays on average power for a point target at any duration", () => {
    const r = judgeStep(
      step({ durationSeconds: 600, target: { watts: 300 } }),
      delivered({ durationSeconds: 600, averageWatts: 250 }),
      DEFAULT_TOLERANCE,
      330
    );
    expect(r.verdictBasis).toBe("average-watts");
    expect(r.verdict).toBe("under");
  });

  it("stays on average power for a ramp at any duration", () => {
    const r = judgeStep(
      step({
        durationSeconds: 600,
        target: { low: 300, high: 350, ramp: true },
      }),
      delivered({ durationSeconds: 600, averageWatts: 250 }),
      DEFAULT_TOLERANCE,
      330
    );
    expect(r.verdictBasis).toBe("average-watts");
    expect(r.verdict).toBe("under");
  });

  it("reports the basis the rule would have chosen on an unmatched or not-attempted step", () => {
    const notAttempted = judgeStep(
      step({ durationSeconds: 600, target: longBand }),
      delivered({ durationSeconds: 100, averageWatts: 250 }),
      DEFAULT_TOLERANCE
    );
    expect(notAttempted.verdict).toBe("not-attempted");
    expect(notAttempted.verdictBasis).toBe("normalized-power");

    const unresolvedTarget = judgeStep(
      step({
        durationSeconds: 600,
        targetUnresolved: "percent-of-FTP target but no FTP",
      }),
      delivered({ durationSeconds: 600 }),
      DEFAULT_TOLERANCE
    );
    expect(unresolvedTarget.verdict).toBe("unmatched");
    expect(unresolvedTarget.verdictBasis).toBe("average-watts");
  });
});

describe("judgeCadence", () => {
  it("reports a point cadence miss on a rep that is on target for power", () => {
    const planned = step({
      durationSeconds: 150,
      target: { low: 390, high: 410 },
      cadence: 100,
    });
    const rode = delivered({
      durationSeconds: 150,
      averageWatts: 396,
      averageCadence: 85,
    });
    expect(judgeStep(planned, rode, DEFAULT_TOLERANCE).verdict).toBe(
      "on-target"
    );
    expect(judgeCadence(planned, rode)).toEqual({
      verdict: "under",
      delta: -15,
    });
  });

  it("allows 5 rpm either side of a point target", () => {
    const planned = step({ cadence: 100 });
    expect(
      judgeCadence(planned, delivered({ averageCadence: 95 }))?.verdict
    ).toBe("on-target");
    expect(
      judgeCadence(planned, delivered({ averageCadence: 105 }))?.verdict
    ).toBe("on-target");
    expect(judgeCadence(planned, delivered({ averageCadence: 106 }))).toEqual({
      verdict: "over",
      delta: 6,
    });
  });

  it("judges a cadence range on its own band, measuring from the crossed edge", () => {
    const planned = step({ cadenceRange: { low: 85, high: 95 } });
    expect(judgeCadence(planned, delivered({ averageCadence: 86 }))).toEqual({
      verdict: "on-target",
      delta: 0,
    });
    expect(judgeCadence(planned, delivered({ averageCadence: 82 }))).toEqual({
      verdict: "under",
      delta: -3,
    });
    expect(judgeCadence(planned, delivered({ averageCadence: 98 }))).toEqual({
      verdict: "over",
      delta: 3,
    });
  });

  it("returns nothing with no planned cadence, no recorded cadence, or a step not attempted", () => {
    expect(judgeCadence(step(), delivered({ averageCadence: 85 }))).toBe(
      undefined
    );
    expect(judgeCadence(step({ cadence: 100 }), delivered())).toBe(undefined);
    expect(
      judgeCadence(
        step({ cadence: 100 }),
        delivered({ durationSeconds: 60, averageCadence: 85 })
      )
    ).toBe(undefined);
  });
});

describe("sliceStepWindow", () => {
  function stream(over: Partial<RawPowerStream> = {}): RawPowerStream {
    return {
      time: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
      watts: [100, 100, 100, 200, 200, 200, 300, 300, 300, 300],
      ...over,
    };
  }

  it("locates the window by elapsed time, not array offset", () => {
    // A gap between elapsed second 3 and 6 (auto-pause) shifts every later
    // sample's offset two places away from its elapsed second.
    const gapped = stream({
      time: [0, 1, 2, 3, 6, 7, 8, 9, 10, 11],
      watts: [10, 10, 10, 10, 40, 40, 40, 40, 40, 40],
    });
    // Elapsed-time window [6, 9) must read the post-gap samples, not the ones
    // that happen to sit at offsets 6-8.
    expect(sliceStepWindow(gapped, 6, 3)).toEqual([40, 40, 40]);
  });

  it("filters out null samples rather than treating them as zero", () => {
    const withNulls = stream({
      watts: [100, null, 100, 200, 200, 200, 300, 300, 300, 300],
    });
    expect(sliceStepWindow(withNulls, 0, 3)).toEqual([100, 100]);
  });

  it("returns undefined when the window falls outside the stream's bounds", () => {
    expect(sliceStepWindow(stream(), 100, 60)).toBeUndefined();
  });

  it("returns undefined when time and watts lengths disagree", () => {
    expect(
      sliceStepWindow(stream({ watts: [100, 200] }), 0, 3)
    ).toBeUndefined();
  });
});

describe("reviewSession", () => {
  function loadPair(name: string) {
    const { event, activity } = fixture(name);
    return {
      planned: flattenPlannedSteps(event?.workout_doc),
      intervals: toDeliveredIntervals(activity?.icu_intervals ?? []),
      event,
      activity,
    };
  }

  it("reads the real sweet-spot session rep by rep", () => {
    const { planned, intervals, event, activity } = loadPair("sweet-spot-3x12");

    const result = reviewSession({
      planned,
      intervals,
      tolerance: DEFAULT_TOLERANCE,
      plannedLoad: event.icu_training_load,
      actualLoad: activity.icu_training_load,
      platformCompliance: activity.compliance,
    });

    expect(result.alignmentBasis).toBe("sequential");
    expect(result.steps).toHaveLength(8);

    // The three work reps, in order: 244 W, 270 W, 264 W against a 255-275 band.
    const work = result.steps.filter((s) => s.stepInRep === 1 && s.repIndex);
    expect(work.map((s) => s.delivered?.averageWatts)).toEqual([244, 270, 264]);
    expect(work.map((s) => s.verdict)).toEqual([
      "under",
      "on-target",
      "on-target",
    ]);
    expect(work[0].deltas?.watts).toBe(-11);
    expect(work.map((s) => s.repIndex)).toEqual([1, 2, 3]);
  });

  it("reports cadence beside power on steps that prescribe it, and leaves other steps unchanged", () => {
    const result = reviewSession({
      planned: [
        step({ index: 0, durationSeconds: 600, target: { watts: 180 } }),
        step({
          index: 1,
          durationSeconds: 150,
          target: { low: 390, high: 410 },
          cadence: 100,
        }),
      ],
      intervals: [
        delivered({
          index: 0,
          durationSeconds: 600,
          averageWatts: 180,
          averageCadence: 80,
        }),
        delivered({
          index: 1,
          durationSeconds: 150,
          averageWatts: 396,
          averageCadence: 85,
        }),
      ],
      tolerance: DEFAULT_TOLERANCE,
    });

    const [warmUp, rep] = result.steps;
    expect(warmUp.verdict).toBe("on-target");
    expect(warmUp.cadenceVerdict).toBeUndefined();
    expect(warmUp.deltas?.cadence).toBeUndefined();
    expect(rep.verdict).toBe("on-target");
    expect(rep.planned.cadence).toBe(100);
    expect(rep.cadenceVerdict).toBe("under");
    expect(rep.deltas?.cadence).toBe(-15);
  });

  it("carries the roll-up including the platform's own compliance", () => {
    const { planned, intervals, event, activity } = loadPair("sweet-spot-3x12");

    const result = reviewSession({
      planned,
      intervals,
      tolerance: DEFAULT_TOLERANCE,
      plannedLoad: event.icu_training_load,
      actualLoad: activity.icu_training_load,
      plannedDurationSeconds: 4200,
      actualDurationSeconds: activity.moving_time,
      platformCompliance: activity.compliance,
    });

    expect(result.rollup.plannedLoad).toBe(75);
    expect(result.rollup.actualLoad).toBe(72);
    expect(result.rollup.platformCompliance).toBe(96);
    expect(result.rollup.unplannedIntervals).toEqual([]);
  });

  it("returns an empty step list but a full roll-up when alignment fails", () => {
    const { planned, intervals, event, activity } = loadPair("track-session");

    const result = reviewSession({
      planned,
      intervals,
      tolerance: DEFAULT_TOLERANCE,
      plannedLoad: event.icu_training_load,
      actualLoad: activity.icu_training_load,
      platformCompliance: activity.compliance,
    });

    expect(result.alignmentBasis).toBe("none");
    expect(result.steps).toEqual([]);
    expect(result.reason).toBe("alignment-failed");
    expect(result.message).toMatch(/rather than a pairing that may be wrong/);
    // The coarse question is still answered.
    expect(result.rollup.plannedLoad).toBe(73);
    expect(result.rollup.actualLoad).toBe(54);
    expect(result.rollup.platformCompliance).toBeCloseTo(73.97, 1);
  });

  it("omits delivered fields entirely on an unmatched step", () => {
    const planned = flattenPlannedSteps({
      steps: [
        { duration: 600, power: { units: "w", value: 160 } },
        { duration: 300, power: { units: "w", value: 280 } },
        { duration: 300, power: { units: "w", value: 280 } },
        { duration: 600, power: { units: "w", value: 140 } },
      ],
    });
    const intervals: DeliveredInterval[] = [
      { index: 0, durationSeconds: 600, averageWatts: 158 },
      { index: 1, durationSeconds: 300, averageWatts: 285 },
      { index: 2, durationSeconds: 600, averageWatts: 141 },
    ];

    const result = reviewSession({
      planned,
      intervals,
      tolerance: DEFAULT_TOLERANCE,
    });

    const unmatched = result.steps.filter((s) => s.verdict === "unmatched");
    expect(unmatched.length).toBeGreaterThan(0);
    for (const s of unmatched) {
      expect(s.delivered).toBeUndefined();
      expect(s.deltas).toBeUndefined();
      expect(s.note).toBeTruthy();
    }
  });

  it("reports recorded work that maps to no planned step", () => {
    const planned = flattenPlannedSteps({
      steps: [
        { duration: 600, power: { units: "w", value: 160 } },
        { duration: 300, power: { units: "w", value: 280 } },
        { duration: 120, power: { units: "w", value: 150 } },
        { duration: 300, power: { units: "w", value: 280 } },
        { duration: 600, power: { units: "w", value: 140 } },
      ],
    });
    const intervals: DeliveredInterval[] = [
      { index: 0, durationSeconds: 600, averageWatts: 160 },
      { index: 1, durationSeconds: 300, averageWatts: 280 },
      { index: 2, durationSeconds: 45, averageWatts: 620 },
      { index: 3, durationSeconds: 120, averageWatts: 150 },
      { index: 4, durationSeconds: 300, averageWatts: 275 },
      { index: 5, durationSeconds: 600, averageWatts: 140 },
    ];

    const result = reviewSession({
      planned,
      intervals,
      tolerance: DEFAULT_TOLERANCE,
    });

    expect(result.alignmentBasis).toBe("duration");
    expect(result.rollup.unplannedIntervals).toEqual([
      {
        intervalIndex: 2,
        type: undefined,
        durationSeconds: 45,
        averageWatts: 620,
      },
    ]);
  });

  describe("with a raw power stream", () => {
    function coastingWindow(): number[] {
      // 5 minutes coasting at 0 W, then 5 minutes steady at 400 W — average
      // watts (200) reads as a shortfall against a 300-350 W band, but the
      // sustained 400 W block is what normalized power responds to.
      return [...Array(300).fill(0), ...Array(300).fill(400)];
    }

    function longBandPlan() {
      return flattenPlannedSteps({
        steps: [{ duration: 600, power: { units: "w", start: 300, end: 350 } }],
      });
    }

    it("judges a long, coasted band step on normalized power", () => {
      const window = coastingWindow();
      const expectedNP = Math.round(normalizedPower(window)!);

      const planned = longBandPlan();
      const intervals: DeliveredInterval[] = [
        { index: 0, startTime: 0, durationSeconds: 600, averageWatts: 200 },
      ];
      const powerStream: RawPowerStream = {
        time: window.map((_, i) => i),
        watts: window,
      };

      const result = reviewSession({
        planned,
        intervals,
        tolerance: DEFAULT_TOLERANCE,
        powerStream,
      });

      expect(result.steps).toHaveLength(1);
      const s = result.steps[0];
      expect(s.delivered?.normalizedWatts).toBe(expectedNP);
      expect(s.delivered?.coastingFraction).toBeCloseTo(0.5, 4);
      expect(s.verdictBasis).toBe("normalized-power");
      expect(expectedNP).toBeGreaterThanOrEqual(300);
      expect(expectedNP).toBeLessThanOrEqual(350);
      expect(s.verdict).toBe("on-target");
    });

    it("still reports normalizedWatts/coastingFraction on a step whose verdict uses average watts", () => {
      const window = coastingWindow();
      const expectedNP = Math.round(normalizedPower(window)!);

      // A point target — always judged on average watts, regardless of duration.
      const planned = flattenPlannedSteps({
        steps: [{ duration: 600, power: { units: "w", value: 200 } }],
      });
      const intervals: DeliveredInterval[] = [
        { index: 0, startTime: 0, durationSeconds: 600, averageWatts: 200 },
      ];
      const powerStream: RawPowerStream = {
        time: window.map((_, i) => i),
        watts: window,
      };

      const result = reviewSession({
        planned,
        intervals,
        tolerance: DEFAULT_TOLERANCE,
        powerStream,
      });

      const s = result.steps[0];
      expect(s.verdictBasis).toBe("average-watts");
      expect(s.verdict).toBe("on-target");
      expect(s.delivered?.normalizedWatts).toBe(expectedNP);
      expect(s.delivered?.coastingFraction).toBeCloseTo(0.5, 4);
    });

    it("falls back to average watts when no power stream is available", () => {
      const planned = longBandPlan();
      const intervals: DeliveredInterval[] = [
        { index: 0, startTime: 0, durationSeconds: 600, averageWatts: 200 },
      ];

      const result = reviewSession({
        planned,
        intervals,
        tolerance: DEFAULT_TOLERANCE,
        // powerStream omitted entirely.
      });

      const s = result.steps[0];
      expect(s.verdictBasis).toBe("normalized-power-fallback");
      expect(s.verdict).toBe("under");
      expect(s.delivered?.normalizedWatts).toBeUndefined();
      expect(s.delivered?.coastingFraction).toBeUndefined();
    });
  });
});

describe("toDeliveredIntervals", () => {
  it("drops zero-length intervals and normalises absent readings", () => {
    const out = toDeliveredIntervals([
      { elapsed_time: 300, average_watts: 250, average_cadence: 0 },
      { elapsed_time: 0, average_watts: 200 },
    ] as never);

    expect(out).toHaveLength(1);
    expect(out[0].averageWatts).toBe(250);
    // A zero cadence reading is absent data, not a real zero.
    expect(out[0].averageCadence).toBeUndefined();
  });
});

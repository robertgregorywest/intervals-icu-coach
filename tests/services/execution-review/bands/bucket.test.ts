import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  bucketPlanned,
  middleBandFraction,
} from "../../../../src/services/execution-review/bands/bucket.js";
import { derivePartition } from "../../../../src/services/execution-review/bands/zones.js";
import type { FlatPlannedStep } from "../../../../src/services/execution-review/steps/types.js";
import type { ZoneRow } from "../../../../src/services/athlete-anchors/index.js";

const FRAME = JSON.parse(
  readFileSync(
    fileURLToPath(
      new URL(
        "../../../fixtures/intensity-distribution/coaching-zones.json",
        import.meta.url
      )
    ),
    "utf8"
  )
) as { ftp: number; mapZones: ZoneRow[] };

const PARTITION = derivePartition(FRAME.mapZones);
/** 76–106% of FTP 290. */
const MIDDLE = { lowW: 220, highW: 307 };

function step(
  partial: Partial<FlatPlannedStep> & { durationSeconds: number }
): FlatPlannedStep {
  return { index: 0, sourceIndex: 0, ...partial };
}

describe("middleBandFraction", () => {
  it("takes a point target as in or out", () => {
    expect(middleBandFraction({ watts: 265 }, MIDDLE)).toBe(1);
    expect(middleBandFraction({ watts: 160 }, MIDDLE)).toBe(0);
    expect(middleBandFraction({ watts: 400 }, MIDDLE)).toBe(0);
  });

  it("takes a range wholly inside the band in full", () => {
    expect(middleBandFraction({ low: 255, high: 275 }, MIDDLE)).toBe(1);
  });

  it("takes a range wholly outside the band as nothing", () => {
    expect(middleBandFraction({ low: 160, high: 205 }, MIDDLE)).toBe(0);
    expect(middleBandFraction({ low: 330, high: 380 }, MIDDLE)).toBe(0);
  });

  /**
   * The case that motivated the rule: a real Z2 prescription whose midpoint
   * (222.5 W) sits barely inside a band starting at 220 W, so midpoint bucketing
   * credited the whole block and reported correctly-ridden endurance rides as
   * 79% shortfalls.
   */
  it("takes a straddling range in proportion to its overlap", () => {
    // (245 − 220) / (245 − 200) = 25/45
    expect(middleBandFraction({ low: 200, high: 245 }, MIDDLE)).toBeCloseTo(
      0.5556,
      4
    );
    // Overlapping the top bound instead.
    expect(middleBandFraction({ low: 287, high: 327 }, MIDDLE)).toBeCloseTo(
      0.5,
      4
    );
  });

  it("touching a bound exactly contributes nothing", () => {
    expect(middleBandFraction({ low: 180, high: 220 }, MIDDLE)).toBe(0);
    expect(middleBandFraction({ low: 307, high: 340 }, MIDDLE)).toBe(0);
  });
});

describe("bucketPlanned — middle band against zone assignment", () => {
  it("splits a straddling range for the band while assigning one zone", () => {
    const result = bucketPlanned(
      [step({ durationSeconds: 3600, target: { low: 200, high: 245 } })],
      PARTITION,
      MIDDLE
    );

    // Zone assignment is unchanged: midpoint 222.5 W lands wholly in L2.
    expect(result.byZone.get("L2")).toBe(3600);
    // The band takes 25/45 of the hour, not all of it.
    expect(result.middleBandSeconds).toBe(2000);
  });

  it("reports whole seconds", () => {
    const result = bucketPlanned(
      [step({ durationSeconds: 1000, target: { low: 210, high: 233 } })],
      PARTITION,
      MIDDLE
    );

    expect(Number.isInteger(result.middleBandSeconds)).toBe(true);
  });
});

describe("bucketPlanned — steps that cannot be bucketed", () => {
  it("excludes an unresolvable target and names it, rather than guessing", () => {
    const result = bucketPlanned(
      [
        step({
          durationSeconds: 600,
          label: "Warm-up",
          targetUnresolved: "percent-of-FTP target but no FTP",
        }),
        step({ index: 1, durationSeconds: 720, target: { watts: 265 } }),
      ],
      PARTITION,
      MIDDLE
    );

    expect(result.unbucketed).toHaveLength(1);
    expect(result.unbucketed[0]).toMatchObject({
      label: "Warm-up",
      durationSeconds: 600,
      reason: "percent-of-FTP target but no FTP",
    });
    // The excluded step is absent from the totals, not zeroed into them.
    expect(result.totalSeconds).toBe(720);
    expect(result.middleBandSeconds).toBe(720);
  });

  it("skips a step with no duration", () => {
    const result = bucketPlanned(
      [step({ durationSeconds: 0, target: { watts: 265 } })],
      PARTITION,
      MIDDLE
    );

    expect(result.totalSeconds).toBe(0);
    expect(result.unbucketed).toHaveLength(0);
  });
});

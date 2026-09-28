import { describe, it, expect } from "vitest";
import {
  buildPowerStream,
  deriveLoad,
} from "../../../src/services/training-load-forecast/load.js";
import { flattenPlannedSteps } from "../../../src/services/prescription/index.js";
import type { FlatPlannedStep } from "../../../src/services/execution-review/index.js";
import { EVENTS } from "../workout-parser/fixture.js";

/**
 * The entries prescribed wholly in absolute watts. Their normalised power
 * reproduces under any threshold, so this assertion cannot go stale when the
 * athlete's FTP moves — which is the whole reason the fixture records the basis
 * per entry rather than filtering the corpus.
 */
const THRESHOLD_FREE = EVENTS.entries.filter(
  (e) => e.loadBasis === "threshold-free" && e.normalized_power !== undefined
);

const round = (n: number) => Math.floor(n + 0.5);

describe("load derivation — fidelity against the platform's own figures", () => {
  it("has a corpus to assert against", () => {
    expect(THRESHOLD_FREE.length).toBeGreaterThan(100);
  });

  it.each(THRESHOLD_FREE.map((e) => [`${e.date} ${e.name}`, e] as const))(
    "reproduces normalised power exactly for %s",
    (_label, entry) => {
      const steps = flattenPlannedSteps(entry.workout_doc, {
        ftp: entry.ftpUsed,
      });
      const derived = deriveLoad(steps, entry.ftpUsed!);
      expect(derived).toBeDefined();
      // Tolerance zero. The stream is a deterministic function of the steps and
      // the platform's own model was fitted until it matched; a drift of even a
      // watt means the model has moved, and that is what this test is for.
      expect(round(derived!.normalizedPower)).toBe(entry.normalized_power);
    }
  );

  it.each(
    THRESHOLD_FREE.filter(
      (e) => e.icu_training_load !== undefined && e.ftpUsed
    ).map((e) => [`${e.date} ${e.name}`, e] as const)
  )("reproduces training load within a point for %s", (_label, entry) => {
    const steps = flattenPlannedSteps(entry.workout_doc, {
      ftp: entry.ftpUsed,
    });
    const derived = deriveLoad(steps, entry.ftpUsed!)!;
    // Tolerance one load point, and stated rather than assumed. Load is the
    // only figure here that needs a threshold, and the threshold this event was
    // computed at is not recorded on it — the fixture recovers it from
    // `icu_intensity` to the nearest watt, and a watt of FTP is worth up to
    // about a point of load on a long session.
    expect(
      Math.abs(derived.load - entry.icu_training_load!)
    ).toBeLessThanOrEqual(1);
  });

  it("reproduces the platform's own figures for a swept ramp", () => {
    // Measured directly: a throwaway `- 60m ramp 100w-300w` event came back
    // with average_watts 200 and normalized_power 221. A midpoint-collapsed
    // ramp would report 200 for both.
    const steps = flattenPlannedSteps(
      {
        steps: [
          {
            duration: 3600,
            ramp: true,
            power: { units: "w", start: 100, end: 300 },
          },
        ],
      },
      { ftp: 286 }
    );
    const derived = deriveLoad(steps, 286)!;
    expect(round(derived.normalizedPower)).toBe(221);
    const { watts } = buildPowerStream(steps);
    expect(round(watts.reduce((a, b) => a + b, 0) / watts.length)).toBe(200);
  });
});

function step(partial: Partial<FlatPlannedStep>): FlatPlannedStep {
  return { index: 0, sourceIndex: 0, ...partial };
}

describe("load derivation — the stream", () => {
  it("takes a band at its midpoint rather than sweeping it", () => {
    const { watts } = buildPowerStream([
      step({ durationSeconds: 4, target: { low: 200, high: 240 } }),
    ]);
    expect(watts).toEqual([220, 220, 220, 220]);
  });

  it("sweeps a ramp across its range", () => {
    const { watts } = buildPowerStream([
      step({ durationSeconds: 5, target: { low: 100, high: 200, ramp: true } }),
    ]);
    expect(watts).toEqual([100, 125, 150, 175, 200]);
  });

  it("names a step it cannot resolve and contributes no time for it", () => {
    const { watts, gaps } = buildPowerStream([
      step({ index: 0, durationSeconds: 60, target: { watts: 200 } }),
      step({
        index: 1,
        label: "Threshold",
        durationSeconds: 60,
        targetUnresolved: "percent-of-FTP target but no FTP available",
      }),
    ]);
    expect(watts).toHaveLength(60);
    expect(gaps).toEqual([
      {
        stepIndex: 1,
        label: "Threshold",
        reason: "percent-of-FTP target but no FTP available",
      },
    ]);
  });

  it("reports a wholly unresolvable session as underivable, not as zero load", () => {
    const derived = deriveLoad(
      [step({ durationSeconds: 3600, targetUnresolved: "no FTP" })],
      286
    );
    expect(derived).toBeUndefined();
  });
});

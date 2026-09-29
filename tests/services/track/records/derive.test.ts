/**
 * The derivation, checked against the figures the prose arrived at by hand.
 *
 * `docs/personal/track-context.md` §4 and §5 are the oracle here: they were
 * computed independently of this code, before it existed, so reproducing them
 * is what says the arithmetic is right rather than merely self-consistent.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  deriveRun,
  developmentFromBasis,
  segmentLapsFor,
  startFor,
  MAX_SEGMENT_LAPS,
} from "../../../../src/services/track/records/derive.js";
import { compareRuns } from "../../../../src/services/track/records/compare.js";
import { parseTrackSessionRecord } from "../../../../src/services/track/records/record.js";
import {
  type DerivedRun,
  type SessionBasis,
  type TrackSessionRecord,
} from "../../../../src/services/track/records/types.js";

function record(name: string): TrackSessionRecord {
  const file = `${name}.md`;
  return parseTrackSessionRecord(
    readFileSync(
      fileURLToPath(
        new URL(`../../../fixtures/track-sessions/${file}`, import.meta.url)
      ),
      "utf8"
    ),
    file
  );
}

function derived(name: string, run = 0, segmentLaps?: number): DerivedRun {
  const r = record(name);
  return deriveRun(
    r.basis,
    r.runs[run],
    developmentFromBasis(r.basis)?.meters,
    segmentLaps
  );
}

describe("developmentFromBasis", () => {
  const basis = (over: Partial<SessionBasis>): SessionBasis => ({
    id: "x",
    date: "2026-01-01",
    kind: "training",
    rolloutMm: 2099,
    lapDistanceMeters: 250,
    start: "flying",
    runStarts: {},
    ...over,
  });

  it("is (chainring / cog) × rollout, in metres", () => {
    const d = developmentFromBasis(basis({ gear: "65x16" }));
    expect(d?.source).toBe("gear");
    expect(d?.meters).toBeCloseTo(8.5272, 4);
  });

  // The nominal "gear inches" convention assumes a 27" wheel, whose circumference
  // is 2.154 m — so it would give 8.75 m/rev here, a few percent above the true
  // development. `track-context.md` §1 records what mistaking the two cost.
  it("uses the real rollout, not the 27-inch nominal wheel", () => {
    const nominal = (65 / 16) * 27 * 0.0254 * Math.PI;
    expect(nominal).toBeCloseTo(8.75, 2);
    const d = developmentFromBasis(basis({ gear: "65x16" }))!;
    expect(d.meters).toBeLessThan(nominal);
    expect(nominal / d.meters - 1).toBeGreaterThan(0.02);
  });

  it("accepts the × separator and honours a non-default rollout", () => {
    expect(
      developmentFromBasis(basis({ gear: "64×16", rolloutMm: 2096 }))?.meters
    ).toBeCloseTo(8.384, 3);
  });

  it("prefers a supplied development over the gear, and says so", () => {
    const d = developmentFromBasis(
      basis({ gear: "65x16", developmentMeters: 8.5 })
    );
    expect(d).toEqual({ meters: 8.5, source: "supplied" });
  });

  it("is undefined with no gear, which leaves cadence out rather than guessed", () => {
    expect(developmentFromBasis(basis({}))).toBeUndefined();
  });
});

describe("startFor", () => {
  it("takes the run's override over the session default", () => {
    const r = record("2026-07-12-training");
    expect(startFor(r.basis, "run-1")).toBe("flying");
    const withOverride = {
      ...r.basis,
      runStarts: { "run-1": "gate" as const },
    };
    expect(startFor(withOverride, "run-1")).toBe("gate");
    expect(startFor(withOverride, "run-2")).toBe("flying");
  });
});

describe("segmentLapsFor", () => {
  // The gap is what makes a decline a comparison of two ends rather than of
  // overlapping windows, so it survives an explicit request too.
  it("leaves at least one lap between the segments", () => {
    expect(segmentLapsFor(7)).toBe(3);
    expect(segmentLapsFor(6)).toBe(2);
    expect(segmentLapsFor(5)).toBe(2);
    expect(segmentLapsFor(4)).toBe(1);
    expect(segmentLapsFor(2)).toBe(0);
  });

  it("caps at three even on a long run", () => {
    expect(segmentLapsFor(20)).toBe(MAX_SEGMENT_LAPS);
  });

  it("clamps a request that would overlap", () => {
    expect(segmentLapsFor(7, 2)).toBe(2);
    expect(segmentLapsFor(5, 3)).toBe(2);
  });
});

describe("deriveRun — Nationals 2026, the prose oracle", () => {
  const run = derived("2026-nationals-ip");

  it("marks the gate lap and excludes it from every aggregate", () => {
    expect(run.start).toBe("gate");
    expect(run.laps[0].standingStart).toBe(true);
    expect(run.laps.slice(1).every((l) => !l.standingStart)).toBe(true);
    expect(run.summary.flyingLaps).toBe(7);
    expect(run.summary.totalTimeSeconds).toBe(135.42);
    expect(run.summary.flyingTimeSeconds).toBe(112.21);
  });

  // track-context.md §4: lap 2 at 16.036 m/s, 112.85 rpm.
  it("reproduces the lap-2 speed and cadence", () => {
    const lap2 = run.laps[1];
    expect(lap2.lapTimeSeconds).toBe(15.59);
    expect(lap2.speedMetersPerSecond).toBeCloseTo(16.036, 3);
    // Within 0.05 rpm of the prose, which quotes development to four
    // significant figures rather than carrying it exact.
    expect(lap2.cadenceRpm).toBeCloseTo(112.85, 1);
  });

  it("reproduces the flying mean speed", () => {
    expect(run.summary.meanSpeedMetersPerSecond).toBeCloseTo(15.6, 2);
    expect(run.summary.meanLapTimeSeconds).toBeCloseTo(16.03, 2);
  });

  // season.md quotes −16.8% for this race.
  it("reproduces the decline over laps 2–4 against 6–8", () => {
    expect(run.summary.opening).toMatchObject({ fromLap: 2, toLap: 4 });
    expect(run.summary.closing).toMatchObject({ fromLap: 6, toLap: 8 });
    expect(run.summary.opening?.timeSeconds).toBeCloseTo(46.64, 2);
    expect(run.summary.closing?.timeSeconds).toBeCloseTo(49.59, 2);
    expect(run.summary.declineRatio).toBeCloseTo(-0.168, 3);
  });

  // track-context.md §5: Σv² 1707.29, RMS 15.617, flat 112.06, gain 0.15 s.
  it("reproduces the Σv² pacing figures", () => {
    expect(run.summary.pacing?.sumSquaredSpeed).toBeCloseTo(1707.29, 2);
    expect(run.summary.pacing?.rmsSpeedMetersPerSecond).toBeCloseTo(15.617, 3);
    expect(run.summary.pacing?.flatEquivalentTimeSeconds).toBeCloseTo(
      112.06,
      2
    );
    expect(run.summary.pacing?.gainSeconds).toBeCloseTo(0.15, 2);
  });

  it("keeps rounding out of the aggregates it feeds", () => {
    // Speeds are squared and ratios cubed, so both are computed from the lap
    // times rather than from the rounded per-lap figures. Reported values must
    // therefore land on their stated precision exactly.
    for (const lap of run.laps) {
      expect(lap.speedMetersPerSecond.toString()).toMatch(/^\d+(\.\d{1,3})?$/);
    }
    expect(run.summary.flyingTimeSeconds.toString()).toMatch(
      /^\d+(\.\d{1,2})?$/
    );
  });
});

describe("deriveRun — Nationals 2025", () => {
  const run = derived("2025-nationals-ip");

  it("reproduces the totals and the decline season.md quotes", () => {
    expect(run.summary.totalTimeSeconds).toBe(134.3);
    expect(run.summary.opening?.timeSeconds).toBeCloseTo(46.72, 2);
    expect(run.summary.closing?.timeSeconds).toBeCloseTo(48.84, 2);
    expect(run.summary.declineRatio).toBeCloseTo(-0.125, 3);
    expect(run.summary.pacing?.gainSeconds).toBeCloseTo(0.08, 2);
  });
});

describe("deriveRun — a flying training run", () => {
  const run = derived("2026-07-12-training");

  it("counts every lap as flying, and reports the SD the log records", () => {
    expect(run.start).toBe("flying");
    expect(run.laps.every((l) => !l.standingStart)).toBe(true);
    expect(run.summary.flyingLaps).toBe(run.laps.length);
    expect(run.summary.flyingTimeSeconds).toBe(run.summary.totalTimeSeconds);
    // track-context.md §4 quotes SD 0.11 for this run — sample (n − 1).
    expect(run.summary.lapTimeSdSeconds).toBeCloseTo(0.11, 2);
  });

  it("uses a narrower segment on a shorter run", () => {
    // Six flying laps: laps 1–2 against 5–6, with the middle pair between.
    expect(run.summary.opening).toMatchObject({ fromLap: 1, toLap: 2 });
    expect(run.summary.closing).toMatchObject({ fromLap: 5, toLap: 6 });
  });

  it("honours an explicit segmentLaps", () => {
    const narrow = derived("2026-07-12-training", 0, 1);
    expect(narrow.summary.opening).toMatchObject({ fromLap: 1, toLap: 1 });
    expect(narrow.summary.closing).toMatchObject({ fromLap: 6, toLap: 6 });
  });
});

describe("deriveRun — no gear, no cadence", () => {
  it("omits cadence rather than inventing a development", () => {
    const r = record("2026-nationals-ip");
    const run = deriveRun(
      { ...r.basis, gear: undefined },
      r.runs[0],
      undefined
    );
    expect(run.laps.every((l) => l.cadenceRpm === undefined)).toBe(true);
    expect(run.laps[0].speedMetersPerSecond).toBeGreaterThan(0);
  });
});

describe("deriveRun — flying-lap boundaries", () => {
  const r = record("2026-nationals-ip");
  const withLaps = (n: number) =>
    deriveRun(
      { ...r.basis, start: "gate" },
      { ...r.runs[0], laps: r.runs[0].laps.slice(0, n) },
      undefined
    );

  function noNaN(value: unknown, path = "run"): void {
    if (typeof value === "number") {
      expect(Number.isNaN(value), path).toBe(false);
    } else if (value && typeof value === "object") {
      for (const [k, v] of Object.entries(value)) noNaN(v, `${path}.${k}`);
    }
  }

  it("three flying laps give single-lap segments and a decline", () => {
    const run = withLaps(4);
    expect(run.summary.flyingLaps).toBe(3);
    expect(run.summary.opening).toMatchObject({ fromLap: 2, toLap: 2 });
    expect(run.summary.closing).toMatchObject({ fromLap: 4, toLap: 4 });
    expect(run.summary.declineRatio).toBeDefined();
    expect(run.summary.segmentsWithheld).toBeUndefined();
  });

  it("two flying laps withhold segments and decline, keeping the rest", () => {
    const run = withLaps(3);
    expect(run.summary.flyingLaps).toBe(2);
    expect(run.summary.opening).toBeUndefined();
    expect(run.summary.declineRatio).toBeUndefined();
    expect(run.summary.segmentsWithheld).toBeDefined();
    expect(run.summary.meanSpeedMetersPerSecond).toBeGreaterThan(0);
    expect(run.summary.pacing).toBeDefined();
  });

  it("no flying laps withholds every flying aggregate, with no NaN", () => {
    const run = withLaps(1);
    expect(run.summary.flyingLaps).toBe(0);
    expect(run.summary.meanLapTimeSeconds).toBeUndefined();
    expect(run.summary.meanSpeedMetersPerSecond).toBeUndefined();
    expect(run.summary.lapTimeSdSeconds).toBeUndefined();
    expect(run.summary.opening).toBeUndefined();
    expect(run.summary.declineRatio).toBeUndefined();
    expect(run.summary.pacing).toBeUndefined();
    expect(run.summary.flyingWithheld).toMatch(/no flying laps/);
    expect(run.summary.totalTimeSeconds).toBeGreaterThan(0);
    expect(run.laps).toHaveLength(1);
    noNaN(run);
  });

  it("is NaN-free for every lap count from one up", () => {
    for (let n = 1; n <= r.runs[0].laps.length; n++) noNaN(withLaps(n));
  });
});

describe("compareRuns — a run with no flying laps", () => {
  it("refuses rather than dividing by zero", () => {
    const rec = record("2026-nationals-ip");
    const basis = { ...rec.basis, start: "gate" as const };
    const make = (n: number) => ({
      ref: `x#${n}`,
      record: rec,
      run: deriveRun(
        basis,
        { ...rec.runs[0], laps: rec.runs[0].laps.slice(0, n) },
        undefined
      ),
    });
    expect(() => compareRuns([make(1), make(1)])).toThrow(
      /no flying laps are not comparable/
    );
  });
});

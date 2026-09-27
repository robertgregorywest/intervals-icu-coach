import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  fitRun,
  residualAt,
  STRONG_RESIDUAL_RPM,
} from "../../../../src/services/track/alignment/fit.js";
import { parseLapSplits } from "../../../../src/services/track/alignment/splits.js";
import {
  detectCandidateWindows,
  searchRange,
} from "../../../../src/services/track/alignment/windows.js";
import type { TimedStream } from "../../../../src/services/track/alignment/samples.js";

function read(name: string) {
  return readFileSync(
    fileURLToPath(
      new URL(`../../../fixtures/track-lap-alignment/${name}`, import.meta.url)
    ),
    "utf8"
  );
}

const SESSION = JSON.parse(read("track-session-2026-08-08.json"));
const RUNS = parseLapSplits(read("splits-2026-08-08.csv"));
const CADENCE: TimedStream = { times: SESSION.time, values: SESSION.cadence };

const WINDOWS = detectCandidateWindows(
  SESSION.time,
  SESSION.cadence,
  Math.min(...RUNS.map((r) => r.durationSeconds))
);

function fitInOwnWindow(index: number) {
  const run = RUNS[index];
  const range = searchRange(
    WINDOWS[index],
    run,
    SESSION.time[0],
    SESSION.time[SESSION.time.length - 1] + 1
  )!;
  return fitRun(CADENCE, run, range, 250)!;
}

describe("residualAt", () => {
  it("recovers rollout from lap speed and recorded cadence", () => {
    // 250 m in 16 s is 15.625 m/s; at 8 m per revolution that is 117.19 rpm.
    const times = Array.from({ length: 200 }, (_, i) => i);
    const cadence: TimedStream = { times, values: times.map(() => 117.1875) };
    const run = parseLapSplits("1,250,16,16\n1,500,32,16\n1,750,48,16\n")[0];

    const at = residualAt(cadence, run, 10, 250)!;
    expect(at.rolloutMeters).toBeCloseTo(8, 6);
    expect(at.residualRpm).toBeCloseTo(0, 6);
    expect(at.lapsFitted).toBe(3);
    expect(at.lapsExcluded).toBe(0);
  });

  it("drops laps with no usable cadence instead of scoring them as zero", () => {
    const times = Array.from({ length: 200 }, (_, i) => i);
    const values = times.map((t) => (t >= 26 && t < 42 ? 0 : 117.1875));
    const run = parseLapSplits("1,250,16,16\n1,500,32,16\n1,750,48,16\n")[0];

    const at = residualAt({ times, values }, run, 10, 250)!;
    expect(at.lapsFitted).toBe(2);
    expect(at.lapsExcluded).toBe(1);
    // The surviving laps still recover the true rollout.
    expect(at.rolloutMeters).toBeCloseTo(8, 6);
  });

  it("returns null when fewer than two laps survive", () => {
    const times = Array.from({ length: 200 }, (_, i) => i);
    const run = parseLapSplits("1,250,16,16\n1,500,32,16\n")[0];
    expect(
      residualAt({ times, values: times.map(() => 0) }, run, 10, 250)
    ).toBeNull();
  });
});

describe("fitRun on the 2026-08-08 session", () => {
  it("fits every run under the strong-residual threshold", () => {
    for (let i = 0; i < RUNS.length; i++) {
      const fit = fitInOwnWindow(i);
      expect(fit.residualRpm, `run ${RUNS[i].run}`).toBeLessThan(
        STRONG_RESIDUAL_RPM
      );
      expect(fit.lapsFitted).toBe(RUNS[i].laps.length);
      expect(fit.lapsExcluded).toBe(0);
    }
  });

  it("recovers a consistent rollout across the four runs", () => {
    const rollouts = RUNS.map((_, i) => fitInOwnWindow(i).rolloutMeters);
    const min = Math.min(...rollouts);
    const max = Math.max(...rollouts);
    const mean = rollouts.reduce((a, b) => a + b, 0) / rollouts.length;

    // ~8.35 m of assumed lap distance per revolution. This session was ridden on
    // 64x16, whose true development is 8.396 m/rev (§1), so the fit reads 0.5%
    // short — as it does on the 12 Jul fixture's 65x16. See hand-fit.test.ts.
    expect(mean).toBeGreaterThan(8.2);
    expect(mean).toBeLessThan(8.5);
    expect(((max - min) / mean) * 100).toBeLessThan(0.5);
  });

  it("reports an offset interval wider than the sweep step", () => {
    // The objective is flat near its minimum; the interval is how that is said
    // out loud rather than implied by a single offset.
    for (let i = 0; i < RUNS.length; i++) {
      const fit = fitInOwnWindow(i);
      const [low, high] = fit.offsetIntervalSeconds;
      expect(high - low).toBeGreaterThan(0.02);
      expect(fit.offsetSeconds).toBeGreaterThanOrEqual(low);
      expect(fit.offsetSeconds).toBeLessThanOrEqual(high);
    }
  });

  it("flags run 3 as ambiguous — a distinct offset fits nearly as well", () => {
    const fit = fitInOwnWindow(2);
    expect(fit.verdict).toBe("ambiguous");
    expect(fit.residualRatio).toBeLessThan(1.15);
    expect(fit.nextBestOffsetSeconds).toBeDefined();
    expect(
      Math.abs(fit.nextBestOffsetSeconds! - fit.offsetSeconds)
    ).toBeGreaterThan(2);
  });

  it("calls the other three runs strong", () => {
    for (const i of [0, 1, 3]) {
      expect(fitInOwnWindow(i).verdict, `run ${RUNS[i].run}`).toBe("strong");
    }
  });
});

describe("fitRun guards", () => {
  it("calls a stretch of easy riding weak, however low its residual", () => {
    // The failure this whole design exists to prevent: with rollout free, a
    // near-constant cadence fits any near-constant speed profile, and on the
    // real session an unconstrained search found 0.84 rpm and a 10.25 m
    // "rollout" in easy riding. Constraining the search to candidate windows is
    // the first defence; this is the second, for a window that turns out flat.
    const times = Array.from({ length: 400 }, (_, i) => i);
    const easy: TimedStream = { times, values: times.map(() => 85) };
    const fit = fitRun(easy, RUNS[0], { low: 0, high: 200 }, 250)!;

    // Comfortably inside the strong-residual threshold, and still worthless.
    expect(fit.residualRpm).toBeLessThan(STRONG_RESIDUAL_RPM);
    expect(fit.rolloutMeters).toBeGreaterThan(10);
    expect(fit.verdict).toBe("weak");
    expect(fit.reason).toMatch(/does not place the run/);
  });

  it("returns null when no offset in the range yields a fit", () => {
    const times = Array.from({ length: 400 }, (_, i) => i);
    const dead: TimedStream = { times, values: times.map(() => 0) };
    expect(fitRun(dead, RUNS[0], { low: 0, high: 200 }, 250)).toBeNull();
  });
});

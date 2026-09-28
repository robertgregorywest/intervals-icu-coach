/**
 * The 12 Jul 2026 session, checked against the hand fit `track-context.md` §4
 * records for it.
 *
 * Every other test in this suite locks the tool to its own output on the
 * 2026-08-08 session. This one is the independent check: the per-lap wattages
 * below were derived by hand, before the tool existed, by the method §8
 * describes. A regression that moved the alignment would have to move it in
 * exactly the way a human already arrived at to pass here.
 *
 * It is also a second gear (65×16, 8.526 m/rev, against 64×16 on the other
 * fixture) and a stream with real recording stops in it.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createTrack } from "../../../../src/services/track/index.js";
import type { IActivitiesApi } from "../../../../src/services/activities/index.js";
import type { ActivityStreams } from "../../../../src/services/activities/index.js";
import type { TrackLapAlignmentResult } from "../../../../src/services/track/index.js";
import { createFitCodec } from "../../../../src/services/fit/index.js";

function read(name: string) {
  return readFileSync(
    fileURLToPath(
      new URL(`../../../fixtures/track-lap-alignment/${name}`, import.meta.url)
    ),
    "utf8"
  );
}

const SESSION = JSON.parse(read("track-session-2026-07-12.json"));
const SPLITS = read("splits-2026-07-12.csv");

/** Per-lap watts as `track-context.md` §4 records them, derived by hand. */
const HAND_FIT: Record<string, number[]> = {
  "1": [367, 388, 392, 376, 383, 338],
  "2": [355, 382, 386, 405, 409, 409],
  "3": [305, 327, 329, 357, 358, 367, 385, 381],
};

/** True development of 65×16 on ~2099 mm rollout (§1). */
const DEVELOPMENT_65_16 = 8.526;

let result: TrackLapAlignmentResult;

async function align() {
  if (result) return result;
  const activitiesApi: IActivitiesApi = {
    getActivities: async () => [],
    getActivity: async () => {
      throw new Error("not used");
    },
    getActivityLaps: async () => null,
    getActivityStreams: async () =>
      ({
        time: SESSION.time,
        watts: SESSION.watts,
        cadence: SESSION.cadence,
        heartrate: SESSION.heartrate,
      }) as ActivityStreams,
  };
  result = await createTrack({ activitiesApi, fit: createFitCodec() }).align({
    activityId: "i164949895",
    splits: SPLITS,
  });
  return result;
}

describe("the 12 Jul session against its hand fit", () => {
  it("places all three runs strongly, none ambiguous", async () => {
    const r = await align();
    expect(r.runs.map((x) => x.run)).toEqual(["1", "2", "3"]);
    for (const run of r.runs) {
      expect(run.confidence.verdict, `run ${run.run}`).toBe("strong");
      expect(run.confidence.residualRpm, `run ${run.run}`).toBeLessThan(0.5);
      expect(run.laps, `run ${run.run}`).toBeDefined();
    }
    // Unlike 2026-08-08, no run here has a rival offset anywhere near it.
    for (const run of r.runs) {
      expect(run.confidence.residualRatio!, `run ${run.run}`).toBeGreaterThan(
        1.15
      );
    }
  });

  it("reproduces the hand fit lap by lap, bar the run-1 finish", async () => {
    // A validity check, not a precision one, and deliberately so: mid-run power
    // is smooth enough that this comparison still passes with the whole session
    // shifted 2 s, so it cannot police the offset. It says the tool found the
    // right runs and cut them at the right laps. The offsets themselves are
    // locked in the next test, which is what a regression would actually move.
    const r = await align();
    const differences: number[] = [];
    for (const run of r.runs) {
      const hand = HAND_FIT[run.run];
      run.laps!.forEach((lap, i) => {
        const label = `run ${run.run} lap ${i + 1}`;
        if (run.run === "1" && i === hand.length - 1) return;
        expect(lap.reading.watts!, label).toBeGreaterThan(hand[i] - 15);
        expect(lap.reading.watts!, label).toBeLessThan(hand[i] + 15);
        differences.push(Math.abs(lap.reading.watts! - hand[i]));
      });
    }
    const mean = differences.reduce((a, b) => a + b, 0) / differences.length;
    expect(mean).toBeLessThan(5);
  });

  it("puts every run where the fit put it", async () => {
    // The tight lock. These are the offsets the fit reaches against the live
    // activity, and the fixture keeps the source's own time base so they are
    // directly comparable. Anything that moves the alignment moves these.
    const r = await align();
    const expected: Record<string, number> = {
      "1": 2513.1,
      "2": 4353.92,
      "3": 5972.08,
    };
    for (const run of r.runs) {
      expect(run.startOffsetSeconds, `run ${run.run}`).toBeCloseTo(
        expected[run.run],
        1
      );
    }
  });

  it("flags the one lap it disagrees with, rather than hiding it", async () => {
    // Run 1's closing lap is where tool and hand fit part company — 374 W
    // against 338 W. It is also the lap carrying by far the widest band in the
    // session, because the offset interval slides that window into the
    // post-line power collapse. The disagreement is inside the band it
    // publishes, which is the whole point of publishing one.
    const r = await align();
    const laps = r.runs[0].laps!;
    const finish = laps[laps.length - 1];
    const hand = HAND_FIT["1"];

    expect(finish.reading.wattsBand!).toBeGreaterThan(40);
    expect(finish.reading.wattsBand!).toBeGreaterThan(
      Math.max(...laps.slice(0, -1).map((l) => l.reading.wattsBand!)) * 4
    );
    expect(
      Math.abs(finish.reading.watts! - hand[hand.length - 1])
    ).toBeLessThan(finish.reading.wattsBand!);
  });

  it("recovers this session's gear, a different one from the other fixture", async () => {
    const r = await align();
    expect(r.rolloutAgreement!.spreadPercent).toBeLessThan(0.5);

    // ~8.497 m against 8.526 — 0.34% short. The 2026-08-08 fixture, on 64×16,
    // comes out 0.51% short of its own 8.396. Two gears, the same small bias,
    // consistent with a lap ridden slightly longer than the 250 m assumed.
    const mean =
      r.runs.reduce((a, x) => a + x.fittedRolloutMeters, 0) / r.runs.length;
    expect(mean).toBeLessThan(DEVELOPMENT_65_16);
    expect((DEVELOPMENT_65_16 - mean) / DEVELOPMENT_65_16).toBeLessThan(0.01);
    // Clear of 64×16's 8.396, so the fit tells the two gears apart.
    expect(mean).toBeGreaterThan(8.45);
  });

  it("reads a stream with recording stops in it without indexing by position", async () => {
    // The source activity pauses for 305 s, 44 s and 16 s. Sample n is not
    // second n, and every window here is resolved by time.
    const r = await align();
    const gaps: number[] = [];
    for (let i = 1; i < SESSION.time.length; i++) {
      const d = SESSION.time[i] - SESSION.time[i - 1];
      if (d > 1) gaps.push(d);
    }
    expect(gaps.length).toBeGreaterThan(0);
    expect(r.samplingIntervalSeconds).toBe(1);
    expect(r.runs[2].startOffsetSeconds).toBeGreaterThan(SESSION.time.length);
  });
});

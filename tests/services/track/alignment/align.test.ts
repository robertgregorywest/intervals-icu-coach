import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  createTrack,
  TrackAlignmentError,
} from "../../../../src/services/track/index.js";
import type { IActivitiesApi } from "../../../../src/services/activities/index.js";
import type { ActivityStreams } from "../../../../src/services/activities/index.js";

function read(name: string) {
  return readFileSync(
    fileURLToPath(
      new URL(`../../../fixtures/track-lap-alignment/${name}`, import.meta.url)
    ),
    "utf8"
  );
}

const SESSION = JSON.parse(read("track-session-2026-08-08.json"));
const SPLITS = read("splits-2026-08-08.csv");

function apiReturning(streams: Partial<ActivityStreams>): IActivitiesApi {
  return {
    getActivities: async () => [],
    getActivity: async () => {
      throw new Error("not used");
    },
    getActivityLaps: async () => null,
    getActivityStreams: async () => streams as ActivityStreams,
  };
}

const fullStreams = {
  time: SESSION.time,
  watts: SESSION.watts,
  cadence: SESSION.cadence,
  heartrate: SESSION.heartrate,
};

async function align(
  streams: Partial<ActivityStreams> = fullStreams,
  splits = SPLITS,
  lapDistanceMeters?: number
) {
  return createTrack({ activitiesApi: apiReturning(streams) }).align({
    activityId: "i173732945",
    splits,
    lapDistanceMeters,
  });
}

describe("align on the 2026-08-08 session", () => {
  it("places all four runs, in the order the export gives them", async () => {
    const result = await align();
    expect(result.runs.map((r) => r.run)).toEqual(["1", "2", "3", "4"]);

    const offsets = result.runs.map((r) => r.startOffsetSeconds);
    for (let i = 1; i < offsets.length; i++) {
      expect(offsets[i]).toBeGreaterThan(offsets[i - 1]);
    }
    expect(result.samplingIntervalSeconds).toBe(1);
  });

  it("answers the question the detected intervals could not", async () => {
    const result = await align();
    const [runOne, runTwo] = result.runs;

    // Both read "~390 W" once the rolling entry was backed out by assumption.
    // Cut at the lap timer's own boundaries they separate: run two was 0.84 s
    // quicker over seven laps on about 4 W more.
    expect(runOne.average.watts).toBe(376);
    expect(runTwo.average.watts).toBe(380);
    expect(runOne.durationSeconds).toBe(114.26);
    expect(runTwo.durationSeconds).toBe(113.42);

    // And the difference clears its own uncertainty band.
    expect(runOne.average.wattsBand).toBeLessThan(4);
    expect(runTwo.average.wattsBand).toBeLessThan(4);
  });

  it("excludes the rolling entry from the scored run", async () => {
    const result = await align();
    const runOne = result.runs[0];

    // The above-threshold effort around run one spans ~120 s; the scored run is
    // 114.26 s, and its first lap starts at the fitted start, not at the window.
    expect(runOne.laps![0].startSeconds).toBeCloseTo(
      runOne.startOffsetSeconds,
      2
    );
    const last = runOne.laps![runOne.laps!.length - 1];
    expect(last.endSeconds - runOne.laps![0].startSeconds).toBeCloseTo(
      114.26,
      1
    );
    // A wind-up lap would drag the opening lap far below the run average.
    expect(runOne.laps![0].reading.watts!).toBeGreaterThan(350);
  });

  it("recovers a consistent rollout across runs and reports the spread", async () => {
    const result = await align();
    expect(result.rolloutAgreement).toBeDefined();
    expect(result.rolloutAgreement!.spreadPercent).toBeLessThan(0.5);
    expect(result.rolloutAgreement!.minMeters).toBeGreaterThan(8.2);
    expect(result.rolloutAgreement!.maxMeters).toBeLessThan(8.5);
  });

  it("publishes the thresholds each verdict was judged against", async () => {
    const result = await align();
    expect(result.thresholds).toEqual({
      strongResidualRpm: 1.0,
      marginalResidualRpm: 2.0,
      ambiguousResidualRatio: 1.15,
      minSamplesPerLap: 8,
    });
  });

  it("gives every run an offset interval it cannot resolve within", async () => {
    const result = await align();
    for (const run of result.runs) {
      const [low, high] = run.confidence.offsetIntervalSeconds;
      expect(high).toBeGreaterThan(low);
      expect(run.startOffsetSeconds).toBeGreaterThanOrEqual(low);
      expect(run.startOffsetSeconds).toBeLessThanOrEqual(high);
      expect(run.confidence.lapsFitted).toBeGreaterThan(0);
    }
  });

  it("bands a run's final lap far wider than its middle laps", async () => {
    // The offset interval slides the closing window into the post-line power
    // collapse, so the last lap is the least trustworthy reading in the run.
    // Currently that fragility is invisible; here it is a number.
    const result = await align();
    const runOne = result.runs[0];
    const laps = runOne.laps!;
    const finalBand = laps[laps.length - 1].reading.wattsBand!;
    const middleBands = laps.slice(1, -1).map((l) => l.reading.wattsBand!);

    expect(finalBand).toBeGreaterThan(15);
    expect(finalBand).toBeGreaterThan(Math.max(...middleBands) * 2);
  });

  it("withholds per-lap readings for the run whose alignment is ambiguous", async () => {
    const result = await align();
    const runThree = result.runs[2];

    expect(runThree.confidence.verdict).toBe("ambiguous");
    expect(runThree.laps).toBeUndefined();
    expect(runThree.lapsWithheld).toMatch(/ambiguous/);
    // The run is still placed well enough to average.
    expect(runThree.average.watts).toBe(338);
  });

  it("returns per-lap readings for the runs that fit strongly", async () => {
    const result = await align();
    for (const index of [0, 1, 3]) {
      const run = result.runs[index];
      expect(run.confidence.verdict, `run ${run.run}`).toBe("strong");
      expect(run.laps, `run ${run.run}`).toHaveLength(run.run === "4" ? 8 : 7);
      expect(run.lapsWithheld).toBeUndefined();
      for (const lap of run.laps!) {
        expect(lap.reading.watts).toBeGreaterThan(0);
        expect(lap.reading.cadence).toBeGreaterThan(0);
      }
    }
  });
});

describe("align failure modes", () => {
  it("rejects an activity with no cadence stream", async () => {
    await expect(
      align({ time: SESSION.time, watts: SESSION.watts })
    ).rejects.toThrow(TrackAlignmentError);
    await expect(
      align({ time: SESSION.time, watts: SESSION.watts })
    ).rejects.toThrow(/no cadence stream/);
  });

  it("reports power as absent rather than zero when there is no power stream", async () => {
    const result = await align({
      time: SESSION.time,
      cadence: SESSION.cadence,
    });
    expect(result.runs[0].average.watts).toBeUndefined();
    expect(result.runs[0].average.cadence).toBeGreaterThan(0);
    expect(result.notes).toContain(
      "The activity carries no power stream, so lap and run power are absent."
    );
  });

  it("reports heart rate as absent rather than zero when there is none", async () => {
    const result = await align({
      time: SESSION.time,
      watts: SESSION.watts,
      cadence: SESSION.cadence,
    });
    expect(result.runs[0].average.heartrate).toBeUndefined();
    expect(result.runs[0].average.watts).toBe(376);
  });

  it("withholds per-lap readings when the streams are too coarse for the laps", async () => {
    // The trap track-context.md §8 records: on a 3 s stride there are ~5
    // samples per 16 s lap, and interpolating across that manufactures splits.
    const stride = 3;
    const keep = <T>(a: T[]) => a.filter((_, i) => i % stride === 0);
    const result = await align({
      time: keep(SESSION.time as number[]),
      watts: keep(SESSION.watts as number[]),
      cadence: keep(SESSION.cadence as number[]),
      heartrate: keep(SESSION.heartrate as number[]),
    });

    expect(result.samplingIntervalSeconds).toBe(3);
    for (const run of result.runs) {
      expect(run.laps).toBeUndefined();
      expect(run.lapsWithheld).toMatch(/too coarse/);
    }
    expect(result.notes?.some((n) => /cannot resolve/.test(n))).toBe(true);
  });

  it("rejects splits that do not reconcile before any request is made", async () => {
    let called = false;
    const api = apiReturning(fullStreams);
    const spy: IActivitiesApi = {
      ...api,
      getActivityStreams: async (...args) => {
        called = true;
        return api.getActivityStreams(...args);
      },
    };
    await expect(
      createTrack({ activitiesApi: spy }).align({
        activityId: "i1",
        splits: "1,250,16.26,16.26\n1,500,32.69,17.43\n",
      })
    ).rejects.toThrow(/does not reconcile/);
    expect(called).toBe(false);
  });

  it("rejects an activity whose cadence never rises", async () => {
    const times = Array.from({ length: 900 }, (_, i) => i);
    await expect(
      align({
        time: times,
        watts: times.map(() => 200),
        cadence: times.map(() => 0),
      })
    ).rejects.toThrow(/no stretch of sustained high cadence/);
  });

  it("rejects a ride of unvarying cadence, which offers one window for four runs", async () => {
    const times = Array.from({ length: 900 }, (_, i) => i);
    await expect(
      align({
        time: times,
        watts: times.map(() => 200),
        cadence: times.map(() => 85),
      })
    ).rejects.toThrow(
      /1 candidate window\(s\) but the lap-split record has 4 run/
    );
  });

  it("rejects a session carrying fewer windows than the export has runs", async () => {
    // Only the first two efforts survive; the export still asks for four runs.
    const cut = 380;
    await expect(
      align({
        time: (SESSION.time as number[]).slice(0, cut),
        watts: (SESSION.watts as number[]).slice(0, cut),
        cadence: (SESSION.cadence as number[]).slice(0, cut),
      })
    ).rejects.toThrow(
      /candidate window\(s\) but the lap-split record has 4 run/
    );
  });

  it("honours a lap distance that is not 250 m", async () => {
    // Same session, relabelled as 333.33 m laps: the fitted rollout scales with
    // the lap distance, since it is metres per revolution.
    const relabelled = SPLITS.split("\n")
      .map((line, i) => {
        if (i === 0 || !line.trim()) return line;
        const cells = line.split(",");
        cells[1] = ((Number(cells[1]) / 250) * 333.33).toFixed(2);
        return cells.join(",");
      })
      .join("\n");

    const at250 = await align();
    const at333 = await align(fullStreams, relabelled, 333.33);
    expect(at333.lapDistanceMeters).toBe(333.33);
    expect(at333.runs[0].fittedRolloutMeters).toBeCloseTo(
      at250.runs[0].fittedRolloutMeters * (333.33 / 250),
      3
    );
  });
});

import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createTrack } from "../../../../src/services/track/index.js";
import type { TrackLapAlignmentResult } from "../../../../src/services/track/index.js";
import { writeTrackRuns } from "../../../../src/services/track/writeback/writeback.js";
import type {
  ActivityIntervalsDoc,
  ActivityStreams,
  IActivitiesApi,
  IntervalWrite,
} from "../../../../src/services/activities/index.js";
import { createFitCodec } from "../../../../src/services/fit/index.js";

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
const ACTIVITY = "i173732945";

const fullStreams: Partial<ActivityStreams> = {
  time: SESSION.time,
  watts: SESSION.watts,
  cadence: SESSION.cadence,
  heartrate: SESSION.heartrate,
};

/**
 * A stand-in for the platform that behaves as the live probe showed it does:
 * a write replaces the whole set, and every stretch left uncovered comes back
 * filled with an interval Intervals.icu invented.
 */
function fakeApi(
  streams: Partial<ActivityStreams> = fullStreams,
  startingIntervals = 18
) {
  let current = Array.from({ length: startingIntervals }, (_, i) => ({
    id: i,
    label: null,
    start_index: i * 10,
    end_index: (i + 1) * 10,
  }));

  const replace = vi.fn(async (_id: string, intervals: IntervalWrite[]) => {
    const sampleCount = streams.time?.length ?? 0;
    const backfilled: unknown[] = [];
    let cursor = 0;
    for (const interval of intervals) {
      if (interval.start_index > cursor) {
        backfilled.push({
          label: null,
          start_index: cursor,
          end_index: interval.start_index,
        });
      }
      backfilled.push({ ...interval, average_watts: 300 });
      cursor = interval.end_index;
    }
    if (cursor < sampleCount) {
      backfilled.push({
        label: null,
        start_index: cursor,
        end_index: sampleCount,
      });
    }
    current = backfilled as typeof current;
    return { id: ACTIVITY, icu_intervals: current } as ActivityIntervalsDoc;
  });

  const api: IActivitiesApi = {
    getActivities: async () => [],
    getActivity: async () => {
      throw new Error("not used");
    },
    getActivityLaps: async () => null,
    getActivityStreams: async () => streams as ActivityStreams,
    getActivityIntervals: async () =>
      ({ id: ACTIVITY, icu_intervals: current }) as ActivityIntervalsDoc,
    replaceActivityIntervals: replace,
  };

  return { api, replace, written: () => current };
}

function track(api: IActivitiesApi) {
  return createTrack({ activitiesApi: api, fit: createFitCodec() });
}

async function write(
  overrides: {
    streams?: Partial<ActivityStreams>;
    splits?: string;
    preview?: boolean;
  } = {}
) {
  const { api, replace } = fakeApi(overrides.streams ?? fullStreams);
  const result = await track(api).write({
    activityId: ACTIVITY,
    splits: overrides.splits ?? SPLITS,
    preview: overrides.preview,
  });
  return { result, replace };
}

describe("write on the 2026-08-08 session", () => {
  it("writes one interval per scored run, spanning first lap start to last lap end", async () => {
    const { result, replace } = await write();

    expect(result.runs.map((r) => r.run)).toEqual(["1", "2", "3", "4"]);
    expect(replace).toHaveBeenCalledOnce();

    const sent = replace.mock.calls[0][1];
    expect(sent).toHaveLength(4);

    // Run one: fitted 26.68 - 140.94 s, so 114.26 s of scored run.
    expect(result.runs[0].fittedStartSeconds).toBe(26.68);
    expect(result.runs[0].fittedEndSeconds).toBe(140.94);
    expect(sent[0].end_index - sent[0].start_index).toBe(114);
  });

  it("leaves the rolling entry outside every written interval", async () => {
    const { result } = await write();

    // The above-threshold effort around run one spans ~120 s from ~21 s in; the
    // written interval starts at the line, not at the wind-up.
    expect(result.runs[0].startIndex).toBe(27);
    expect(result.runs[0].startIndex).toBeGreaterThan(21);
  });

  it("sends only boundaries and a label — never a metric", async () => {
    const { replace } = await write();

    for (const interval of replace.mock.calls[0][1]) {
      expect(Object.keys(interval).sort()).toEqual([
        "end_index",
        "label",
        "start_index",
        "type",
      ]);
    }
  });

  it("reports how far each boundary moved to reach a sample", async () => {
    const { result } = await write();
    const runOne = result.runs[0];

    // 26.68 s snaps forward to sample 27; 140.94 s snaps forward to 141.
    expect(runOne.startDriftSeconds).toBeCloseTo(0.32, 2);
    expect(runOne.endDriftSeconds).toBeCloseTo(0.06, 2);

    for (const run of result.runs) {
      expect(Math.abs(run.startDriftSeconds)).toBeLessThanOrEqual(0.5);
      expect(Math.abs(run.endDriftSeconds)).toBeLessThanOrEqual(0.5);
    }
  });

  it("returns the snapped reading beside the fitted one", async () => {
    const { result } = await write();

    for (const run of result.runs) {
      expect(run.fittedReading.watts).toBeDefined();
      expect(run.snappedReading.watts).toBeDefined();
      // Half a sample against a 114 s run: the two agree closely, but the
      // figures are reported separately rather than conflated.
      expect(
        Math.abs(run.snappedReading.watts! - run.fittedReading.watts!)
      ).toBeLessThan(6);
    }
    // The fitted figure is the alignment's own, unchanged.
    expect(result.runs[0].fittedReading.watts).toBe(376);
  });

  it("presents the snapped reading the way the platform will", async () => {
    const { result } = await write();
    const runOne = result.runs[0];

    // Verified against a live write on 2026-08-13: the window averages
    // 375.83 W, and Intervals.icu displays 375 — it truncates power and heart
    // rate to whole units rather than rounding. The fitted figure rounds, as
    // the alignment always has, so the pair differ by presentation as well as
    // by window and both are shown rather than reconciled.
    expect(runOne.fittedReading.watts).toBe(376);
    expect(runOne.snappedReading.watts).toBe(375);

    for (const run of result.runs) {
      expect(Number.isInteger(run.snappedReading.watts)).toBe(true);
      expect(Number.isInteger(run.snappedReading.heartrate)).toBe(true);
    }
  });

  it("labels a strong run plainly and a shaky one with its verdict", async () => {
    const { result } = await write();

    expect(result.runs[0].verdict).toBe("strong");
    expect(result.runs[0].label).toBe("Run 1");

    const ambiguous = result.runs[2];
    expect(ambiguous.verdict).toBe("ambiguous");
    expect(ambiguous.label).toBe("Run 3 (ambiguous fit)");
    expect(ambiguous.reason).toBeTruthy();
  });

  it("writes every placed run, whatever its verdict", async () => {
    const { result, replace } = await write();

    // One of the four is ambiguous. It is disclosed, not dropped.
    expect(result.runs).toHaveLength(4);
    expect(replace.mock.calls[0][1]).toHaveLength(4);
    expect(result.runs.filter((r) => r.verdict !== "strong")).toHaveLength(1);
  });

  it("reports what it replaced and what the activity carries afterwards", async () => {
    const { result } = await write();

    expect(result.intervalsReplaced).toBe(18);
    // Four runs plus the platform's backfill between and around them.
    expect(result.intervalsAfterWrite).toBeGreaterThan(4);
    expect(result.notes.join(" ")).toContain("filled by Intervals.icu");
  });

  it("is idempotent — writing twice leaves one interval per run", async () => {
    const { api, replace } = fakeApi();
    const t = track(api);

    const first = await t.write({
      activityId: ACTIVITY,
      splits: SPLITS,
    });
    const second = await t.write({
      activityId: ACTIVITY,
      splits: SPLITS,
    });

    expect(replace).toHaveBeenCalledTimes(2);
    expect(replace.mock.calls[0][1]).toEqual(replace.mock.calls[1][1]);
    expect(second.runs).toHaveLength(4);
    // The second write replaced what the first one left, not the original 18.
    expect(first.intervalsReplaced).toBe(18);
    expect(second.intervalsReplaced).toBe(first.intervalsAfterWrite);
  });
});

describe("preview", () => {
  it("composes everything and writes nothing", async () => {
    const { result, replace } = await write({ preview: true });

    expect(result.mode).toBe("preview");
    expect(replace).not.toHaveBeenCalled();
    expect(result.intervalsAfterWrite).toBeUndefined();
    expect(result.intervalsReplaced).toBe(18);
  });

  it("previews exactly what a real write produces", async () => {
    const previewed = await write({ preview: true });
    const written = await write();

    expect(previewed.result.runs.map((r) => r.label)).toEqual(
      written.result.runs.map((r) => r.label)
    );
    expect(previewed.result.runs.map((r) => r.startIndex)).toEqual(
      written.result.runs.map((r) => r.startIndex)
    );
    expect(previewed.result.runs.map((r) => r.endIndex)).toEqual(
      written.result.runs.map((r) => r.endIndex)
    );
  });
});

describe("refusing rather than half-writing", () => {
  it("rejects an activity with no cadence stream, writing nothing", async () => {
    const { api, replace } = fakeApi({
      time: SESSION.time,
      watts: SESSION.watts,
    });

    await expect(
      track(api).write({ activityId: ACTIVITY, splits: SPLITS })
    ).rejects.toThrow(/cadence/i);
    expect(replace).not.toHaveBeenCalled();
  });

  it("rejects an unparseable lap-split record, writing nothing", async () => {
    const { api, replace } = fakeApi();

    await expect(
      track(api).write({
        activityId: ACTIVITY,
        splits: "not a lap split record at all",
      })
    ).rejects.toThrow();
    expect(replace).not.toHaveBeenCalled();
  });

  it("rejects splits that do not reconcile, writing nothing", async () => {
    const broken = SPLITS.replace("1,500,32.69,16.43", "1,500,32.69,99.99");
    const { api, replace } = fakeApi();

    await expect(
      track(api).write({ activityId: ACTIVITY, splits: broken })
    ).rejects.toThrow();
    expect(replace).not.toHaveBeenCalled();
  });

  it("surfaces a platform rejection rather than claiming success", async () => {
    const { api } = fakeApi();
    api.replaceActivityIntervals = async () => {
      throw new Error("403 Forbidden");
    };

    await expect(
      track(api).write({ activityId: ACTIVITY, splits: SPLITS })
    ).rejects.toThrow(/403/);
  });

  it("writes nothing when the alignment places no run", async () => {
    const { api, replace } = fakeApi();
    // No real session places zero runs — the alignment refuses first — so
    // this reaches past the interface to hand the writeback an empty fit.
    const align = async () =>
      ({
        activityId: ACTIVITY,
        lapDistanceMeters: 250,
        samplingIntervalSeconds: 1,
        runs: [],
        thresholds: {
          strongResidualRpm: 1,
          marginalResidualRpm: 2,
          ambiguousResidualRatio: 1.2,
          minSamplesPerLap: 8,
        },
      }) as TrackLapAlignmentResult;

    const result = await writeTrackRuns(
      { activitiesApi: api, align },
      { activityId: ACTIVITY, splits: SPLITS }
    );

    expect(result.runs).toHaveLength(0);
    expect(replace).not.toHaveBeenCalled();
    expect(result.notes.join(" ")).toContain("placed no run");
  });
});

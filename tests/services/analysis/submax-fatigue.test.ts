import { describe, it, expect, vi } from "vitest";
import { createActivityAnalysis } from "../../../src/services/analysis/index.js";
import type {
  Activity,
  SubmaxFatigueTest,
} from "../../../src/services/activities/index.js";
import { stubActivitiesApi } from "../../helpers/stub-activities-api.js";

// The one test Intervals.icu has detected so far, as the activity list
// returned it (i193367898, 4 Oct 2026). Every fixture test is this one with
// the fields under test changed.
const DETECTED: SubmaxFatigueTest = {
  type: "POWER",
  start_index: 1560,
  end_index: 1740,
  end_index_hrrc: 0,
  duration: 180,
  average_watts: 287,
  average_mps: 0,
  cv: 9.040753,
  final_bpm: 154,
  hrrc: 0,
  target: 300,
  max_cv_percent: 10,
  tolerance_percent: 5,
  rpe: 0,
  tte_mins: 0,
  ignore: false,
  efficiency_factor: 1.8636364,
};

let nextId = 1;

function ride(
  date: string,
  test: Partial<SubmaxFatigueTest> | null,
  extra: Partial<Activity> = {}
): Activity {
  return {
    id: `i${nextId++}`,
    start_date_local: `${date}T06:40:00`,
    type: "Ride",
    average_temp: 12.34,
    submax_fatigue_test:
      test === null
        ? null
        : { ...DETECTED, average_watts: 300, final_bpm: 150, ...test },
    ...extra,
  } as Activity;
}

function analysisOver(activities: Activity[]) {
  const getActivities = vi.fn(async () => activities);
  const getActivityStreams = vi.fn();
  const getActivity = vi.fn();
  const analysis = createActivityAnalysis({
    activitiesApi: stubActivitiesApi({
      getActivities,
      getActivityStreams,
      getActivity,
    }),
  });
  return { analysis, getActivities, getActivityStreams, getActivity };
}

// The triage example: Mon/Thu from Monday 16 Nov 2026.
const SERIES_DATES = [
  "2026-11-16",
  "2026-11-19",
  "2026-11-23",
  "2026-11-26",
  "2026-11-30",
  "2026-12-03",
  "2026-12-07",
  "2026-12-10",
  "2026-12-14",
];
const SERIES_BPM = [156, 155, 157, 154, 153, 155, 152, 151, 158];
const series = () =>
  SERIES_DATES.map((d, i) => ride(d, { final_bpm: SERIES_BPM[i] }));

describe("getSubmaxFatigueTests", () => {
  it("reads the live sample as one invalid row", async () => {
    const { analysis } = analysisOver([
      ride("2026-10-04", DETECTED, { id: "i193367898", average_temp: 15.81 }),
    ]);
    const result = await analysis.getSubmaxFatigueTests(
      "2026-09-28",
      "2026-10-11"
    );
    expect(result.tests).toEqual([
      {
        date: "2026-10-04",
        activityId: "i193367898",
        target: 300,
        averageWatts: 287,
        cv: 9.04,
        finalBpm: 154,
        efficiencyFactor: 1.86,
        hrrc: null,
        rpe: null,
        tteMins: null,
        averageTemp: 15.8,
        indoor: false,
        valid: false,
        invalidReasons: ["power 4.3% under target (limit 2%)"],
        baseline: { count: 0, meanBpm: null, sdBpm: null },
        deviationBpm: null,
        deviationNote: expect.any(String),
      },
    ]);
  });

  it("reports hrrc when a recovery window was captured", async () => {
    const { analysis } = analysisOver([
      ride("2026-11-16", { end_index_hrrc: 1860, hrrc: 31 }),
    ]);
    const { tests } = await analysis.getSubmaxFatigueTests(
      "2026-11-16",
      "2026-11-16"
    );
    expect(tests[0].hrrc).toBe(31);
  });

  it("reports the athlete's logged rpe and tteMins", async () => {
    const { analysis } = analysisOver([
      ride("2026-11-16", { rpe: 5, tte_mins: 12 }),
    ]);
    const { tests } = await analysis.getSubmaxFatigueTests(
      "2026-11-16",
      "2026-11-16"
    );
    expect(tests[0]).toMatchObject({ rpe: 5, tteMins: 12 });
  });

  it("gives null averageTemp when the head unit recorded none", async () => {
    const { analysis } = analysisOver([
      ride("2026-11-16", {}, { average_temp: null }),
    ]);
    const { tests } = await analysis.getSubmaxFatigueTests(
      "2026-11-16",
      "2026-11-16"
    );
    expect(tests[0].averageTemp).toBeNull();
  });

  describe("exclusion", () => {
    it("gives no row for no test, a non-cycling type or an ignored test", async () => {
      const { analysis } = analysisOver([
        ride("2026-11-16", null),
        ride("2026-11-17", {}, { type: "Run" }),
        ride("2026-11-18", { ignore: true }),
        ride("2026-11-19", {}, { type: "GravelRide" }),
      ]);
      const { tests, summary } = await analysis.getSubmaxFatigueTests(
        "2026-11-16",
        "2026-11-19"
      );
      expect(tests.map((t) => t.date)).toEqual(["2026-11-19"]);
      expect(summary).toMatchObject({ count: 1, ignored: 1 });
    });
  });

  describe("validity", () => {
    const one = async (
      test: Partial<SubmaxFatigueTest>,
      extra: Partial<Activity> = {}
    ) => {
      const { analysis } = analysisOver([ride("2026-11-16", test, extra)]);
      const { tests, summary } = await analysis.getSubmaxFatigueTests(
        "2026-11-16",
        "2026-11-16"
      );
      return { row: tests[0], summary };
    };

    it("marks a VirtualRide indoor", async () => {
      const { row, summary } = await one({}, { type: "VirtualRide" });
      expect(row).toMatchObject({
        indoor: true,
        valid: false,
        invalidReasons: ["indoor"],
      });
      expect(summary.indoor).toBe(1);
    });

    it("marks a trainer ride indoor", async () => {
      const { row } = await one({}, { trainer: true });
      expect(row).toMatchObject({ indoor: true, invalidReasons: ["indoor"] });
    });

    it("refuses power 2.1% off target", async () => {
      const { row } = await one({ average_watts: 306.3 });
      expect(row.invalidReasons).toEqual(["power 2.1% over target (limit 2%)"]);
    });

    it("refuses a pace test without a power check", async () => {
      const { row } = await one({
        type: "PACE",
        average_watts: 0,
        target: 4.2,
      });
      expect(row.invalidReasons).toEqual(["detected by PACE, not power"]);
    });

    it("refuses a CV of 10.1", async () => {
      const { row } = await one({ cv: 10.1 });
      expect(row.invalidReasons).toEqual(["CV 10.1 over limit 10"]);
    });

    it("accepts exactly 2% off and CV 10", async () => {
      for (const watts of [294, 306]) {
        const { row } = await one({ average_watts: watts, cv: 10 });
        expect(row).toMatchObject({ valid: true, invalidReasons: [] });
      }
    });
  });

  describe("baseline", () => {
    it("matches the triage example", async () => {
      const { analysis } = analysisOver(series());
      const { tests } = await analysis.getSubmaxFatigueTests(
        "2026-11-16",
        "2026-12-14"
      );
      for (const t of tests.slice(0, 6)) {
        expect(t.deviationBpm).toBeNull();
        expect(t.deviationNote).toMatch(/6 needed/);
      }
      expect(tests[6].baseline.count).toBe(6);
      expect(tests[6].deviationBpm).toBe(-3);
      expect(tests[8].baseline).toEqual({ count: 8, meanBpm: 154.1, sdBpm: 2 });
      expect(tests[8].deviationBpm).toBe(3.9);
      expect(tests[8].deviationNote).toBeUndefined();
    });

    it("includes a test exactly 28 days earlier and never the test itself", async () => {
      const { analysis } = analysisOver([
        ride("2026-11-01", { final_bpm: 140 }),
        ride("2026-11-28", { final_bpm: 150 }),
        ride("2026-11-29", { final_bpm: 160 }),
      ]);
      const { tests } = await analysis.getSubmaxFatigueTests(
        "2026-11-29",
        "2026-11-29"
      );
      // 1 Nov is 28 days before 29 Nov; 29 Nov itself stays out.
      expect(tests[0].baseline).toMatchObject({ count: 2, meanBpm: 145 });
    });

    it("leaves out a test 29 days earlier", async () => {
      const { analysis } = analysisOver([
        ride("2026-10-31", { final_bpm: 140 }),
        ride("2026-11-29", { final_bpm: 160 }),
      ]);
      const { tests } = await analysis.getSubmaxFatigueTests(
        "2026-11-29",
        "2026-11-29"
      );
      expect(tests[0].baseline.count).toBe(0);
    });

    it("keeps other targets and invalid tests out of baselines", async () => {
      const { analysis } = analysisOver([
        ride("2026-11-20", { target: 280, average_watts: 280 }),
        ride("2026-11-21", { cv: 12 }),
        ride("2026-11-22", {}, { type: "VirtualRide" }),
        ride("2026-11-23", { final_bpm: 151 }),
        ride("2026-11-29", {}),
      ]);
      const { tests } = await analysis.getSubmaxFatigueTests(
        "2026-11-29",
        "2026-11-29"
      );
      expect(tests[0].baseline).toMatchObject({ count: 1, meanBpm: 151 });
    });

    it("gives the same deviations from a range that starts mid-series", async () => {
      const full = await analysisOver(series()).analysis.getSubmaxFatigueTests(
        "2026-11-16",
        "2026-12-14"
      );
      const { analysis } = analysisOver(series());
      const part = await analysis.getSubmaxFatigueTests(
        "2026-12-07",
        "2026-12-14"
      );
      expect(part.tests.map((t) => t.date)).toEqual([
        "2026-12-07",
        "2026-12-10",
        "2026-12-14",
      ]);
      // Ids differ between the two fixture series; the readings must not.
      const reading = (t: (typeof part.tests)[number]) => ({
        baseline: t.baseline,
        deviationBpm: t.deviationBpm,
      });
      expect(part.tests.map(reading)).toEqual(full.tests.slice(6).map(reading));
      expect(part.lookbackFrom).toBe("2026-11-09");
    });
  });

  describe("trend", () => {
    it("is the Theil–Sen slope, robust to one bad morning", async () => {
      // Pairwise weekly slopes: -13, -7, -1 ×6, +5, +11 → median -1.
      const bpm = [160, 159, 170, 157, 156];
      const dates = [
        "2026-11-02",
        "2026-11-09",
        "2026-11-16",
        "2026-11-23",
        "2026-11-30",
      ];
      const { analysis } = analysisOver(
        dates.map((d, i) => ride(d, { final_bpm: bpm[i] }))
      );
      const { summary } = await analysis.getSubmaxFatigueTests(
        "2026-11-02",
        "2026-11-30"
      );
      expect(summary).toMatchObject({
        trendBpmPerWeek: -1,
        trendTarget: 300,
        trendTests: 5,
      });
      expect(summary.trendNote).toBeUndefined();
    });

    it("is null with a note below 4 tests", async () => {
      const { analysis } = analysisOver(series().slice(0, 3));
      const { summary } = await analysis.getSubmaxFatigueTests(
        "2026-11-16",
        "2026-11-23"
      );
      expect(summary.trendBpmPerWeek).toBeNull();
      expect(summary.trendTests).toBe(3);
      expect(summary.trendNote).toMatch(/4 needed/);
    });

    it("fits the latest target only and notes the others", async () => {
      const { analysis } = analysisOver([
        ride("2026-11-02", { target: 280, average_watts: 280 }),
        ride("2026-11-05", { cv: 12 }),
        ...series().slice(0, 4),
      ]);
      const { summary } = await analysis.getSubmaxFatigueTests(
        "2026-11-02",
        "2026-11-26"
      );
      expect(summary).toMatchObject({
        count: 6,
        valid: 5,
        trendTarget: 300,
        trendTests: 4,
      });
      expect(summary.trendBpmPerWeek).not.toBeNull();
      expect(summary.trendNote).toMatch(/more than one target/);
    });
  });

  it("reads one activity list from 28 days before oldest, and nothing else", async () => {
    const { analysis, getActivities, getActivityStreams, getActivity } =
      analysisOver(series());
    await analysis.getSubmaxFatigueTests("2026-12-07", "2026-12-14");
    expect(getActivities.mock.calls).toEqual([["2026-11-09", "2026-12-14"]]);
    expect(getActivityStreams).not.toHaveBeenCalled();
    expect(getActivity).not.toHaveBeenCalled();
  });

  it("refuses a range over 337 days before fetching", async () => {
    const { analysis, getActivities } = analysisOver([]);
    await expect(
      analysis.getSubmaxFatigueTests("2026-01-01", "2026-12-04")
    ).rejects.toThrow(/338 days, over the 337-day maximum/);
    await expect(
      analysis.getSubmaxFatigueTests("2026-01-01", "2026-12-03")
    ).resolves.toBeDefined();
    expect(getActivities).toHaveBeenCalledTimes(1);
  });
});

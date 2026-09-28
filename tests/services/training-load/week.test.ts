import { describe, it, expect, vi } from "vitest";
import { pinnedAnchors } from "../../helpers/anchors.js";
import {
  bucketDelivered,
  middleBandBounds,
} from "../../../src/services/execution-review/index.js";
import { createTrainingLoad } from "../../../src/services/training-load/index.js";
import type { TrainingLoadDeps } from "../../../src/services/training-load/index.js";

function createDeps(): TrainingLoadDeps {
  return {
    activitiesApi: {
      getActivities: vi.fn().mockResolvedValue([
        {
          id: "i1",
          start_date_local: "2026-04-27T07:00:00",
          type: "Ride",
          name: "Endurance Ride",
          source: "WAHOO",
          icu_training_load: 80,
          moving_time: 5400,
          distance: 45000,
          icu_average_watts: 180,
          average_heartrate: 138,
        },
        {
          id: "i2",
          start_date_local: "2026-04-29T18:00:00",
          type: "Run",
          name: "Easy Run",
          source: "GARMIN",
          icu_training_load: 40,
          moving_time: 1800,
          distance: 6000,
        },
      ]),
    },
    wellnessApi: {
      getWellness: vi.fn().mockResolvedValue([
        { id: "2026-04-27", ctl: 50, atl: 45 },
        { id: "2026-05-03", ctl: 53, atl: 50 },
      ]),
    },
    eventsApi: {
      getEvents: vi.fn().mockResolvedValue([
        {
          id: 99,
          start_date_local: "2026-05-02T00:00:00",
          category: "WORKOUT",
          type: "Ride",
          name: "Sweet Spot",
        },
      ]),
    },
  } as unknown as TrainingLoadDeps;
}

describe("TrainingLoad.summarizeWeek", () => {
  it("composes activities + wellness + events into a summary", async () => {
    const deps = createDeps();
    const trainingWeek = createTrainingLoad(deps);
    const result = await trainingWeek.summarizeWeek("2026-04-27");

    expect(result.week).toEqual({ start: "2026-04-27", end: "2026-05-03" });
    expect(result.totals.activityCount).toBe(2);
    expect(result.totals.tss).toBe(120);
    expect(result.totals.durationHours).toBe(2);
    expect(result.bySport.Ride).toEqual({ count: 1, tss: 80, hours: 1.5 });
    expect(result.bySport.Run).toEqual({ count: 1, tss: 40, hours: 0.5 });
    expect(result.fitness?.ctl).toEqual({ start: 50, end: 53, delta: 3 });
    expect(result.fitness?.tsb).toEqual({ start: 5, end: 3 });
    expect(result.completedActivities).toHaveLength(2);
    expect(result.events).toHaveLength(1);
    expect(result.events[0].name).toBe("Sweet Spot");

    expect(deps.activitiesApi.getActivities).toHaveBeenCalledWith(
      "2026-04-27",
      "2026-05-03"
    );
    expect(deps.wellnessApi.getWellness).toHaveBeenCalledWith(
      "2026-04-27",
      "2026-05-03"
    );
    expect(deps.eventsApi.getEvents).toHaveBeenCalledWith(
      "2026-04-27",
      "2026-05-03"
    );
  });

  it("defaults weekStart to current Monday when omitted", async () => {
    const deps = createDeps();
    const trainingWeek = createTrainingLoad(deps);
    await trainingWeek.summarizeWeek();

    const [oldest, newest] = (
      deps.activitiesApi.getActivities as ReturnType<typeof vi.fn>
    ).mock.calls[0];
    expect(oldest).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(newest).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    const startDay = new Date(`${oldest}T00:00:00Z`).getUTCDay();
    expect(startDay).toBe(1);
  });

  it.each([
    ["2026-09-07", "Monday", "2026-09-07"],
    ["2026-09-09", "Wednesday", "2026-09-07"],
    ["2026-09-13", "Sunday", "2026-09-07"],
    ["2026-01-01", "Thursday across a year boundary", "2025-12-29"],
  ])(
    "starts the week on the Monday of a pinned today (%s, %s)",
    async (today, _day, monday) => {
      const deps = { ...createDeps(), today: () => today };
      const result = await createTrainingLoad(deps).summarizeWeek();

      expect(result.week.start).toBe(monday);
      expect(deps.activitiesApi.getActivities).toHaveBeenCalledWith(
        monday,
        result.week.end
      );
    }
  );

  it("prefers an explicit weekStart over the pinned today", async () => {
    const deps = { ...createDeps(), today: () => "2026-09-13" };
    const result = await createTrainingLoad(deps).summarizeWeek("2026-04-27");
    expect(result.week.start).toBe("2026-04-27");
  });

  it("returns null fitness when wellness is empty", async () => {
    const deps = createDeps();
    (
      deps.wellnessApi.getWellness as ReturnType<typeof vi.fn>
    ).mockResolvedValueOnce([]);
    const trainingWeek = createTrainingLoad(deps);

    const result = await trainingWeek.summarizeWeek("2026-04-27");

    expect(result.fitness).toBeNull();
  });
  describe("middle band", () => {
    // FTP 200 => 152..212 W. Three in-band samples of five power samples.
    const watts = [100, 152, 180, 212, 213];

    it("sums delivered seconds in 76-106% FTP from the power stream", async () => {
      const deps = createDeps();
      deps.anchors = pinnedAnchors({
        athlete: async () => ({ ftp: 200 }),
      });
      deps.activitiesApi.getActivityStreams = vi
        .fn()
        .mockResolvedValue({ watts });

      const result = await createTrainingLoad(deps).summarizeWeek("2026-04-27");

      expect(result.middleBand).toMatchObject({
        lowPctFtp: 76,
        highPctFtp: 106,
        ftpRange: { min: 200, max: 200 },
        excludedNoFtp: 0,
        seconds: 3,
        fractionOfPowerTime: 0.6,
      });
      expect(result.middleBand).not.toHaveProperty("note");
      expect(result.completedActivities[0]).toMatchObject({
        ftp: 200,
        lowW: 152,
        highW: 212,
      });
      // Only the ride carries power; the run is not fetched.
      expect(deps.activitiesApi.getActivityStreams).toHaveBeenCalledTimes(1);
      expect(result.completedActivities[0].middleBandSeconds).toBe(3);
      expect(result.completedActivities[1].middleBandSeconds).toBeNull();
    });

    it("reports no middle band when FTP is unavailable", async () => {
      const deps = createDeps();
      deps.anchors = pinnedAnchors({
        athlete: async () => ({ ftp: null }),
      });
      deps.activitiesApi.getActivityStreams = vi.fn();

      const result = await createTrainingLoad(deps).summarizeWeek("2026-04-27");

      expect(result.middleBand).toBeNull();
      expect(deps.activitiesApi.getActivityStreams).not.toHaveBeenCalled();
      expect(
        result.completedActivities.every(
          (a) =>
            a.middleBandSeconds === null && a.ftp === null && a.lowW === null
        )
      ).toBe(true);
    });

    function twoRides(deps: TrainingLoadDeps, ftps: [unknown, unknown]) {
      const ride = (id: string, icu_ftp: unknown) => ({
        id,
        start_date_local: "2026-04-27T07:00:00",
        type: "Ride",
        icu_average_watts: 180,
        icu_ftp,
      });
      deps.activitiesApi.getActivities = vi
        .fn()
        .mockResolvedValue([ride("a", ftps[0]), ride("b", ftps[1])]);
      deps.activitiesApi.getActivityStreams = vi
        .fn()
        .mockResolvedValue({ watts });
    }

    it("measures each ride against its own FTP across an FTP change", async () => {
      const deps = createDeps();
      deps.anchors = pinnedAnchors({ athlete: async () => ({ ftp: 250 }) });
      twoRides(deps, [200, 250]);

      const result = await createTrainingLoad(deps).summarizeWeek("2026-04-27");

      const [a, b] = result.completedActivities;
      // 152..212 W at FTP 200 keeps 152, 180, 212; 190..265 W at 250 keeps 190+.
      expect(a).toMatchObject({ ftp: 200, lowW: 152, highW: 212 });
      expect(a.middleBandSeconds).toBe(3);
      expect(b).toMatchObject({ ftp: 250, lowW: 190, highW: 265 });
      expect(b.middleBandSeconds).toBe(2);
      expect(result.middleBand).toMatchObject({
        ftpRange: { min: 200, max: 250 },
        seconds: 5,
        excludedNoFtp: 0,
      });
      expect(result.middleBand?.note).toMatch(/FTP change/);
    });

    it("matches what the band lens computes for the same ride", async () => {
      const deps = createDeps();
      deps.anchors = pinnedAnchors({ athlete: async () => ({ ftp: 250 }) });
      twoRides(deps, [200, 250]);

      const result = await createTrainingLoad(deps).summarizeWeek("2026-04-27");

      const lens = (ftp: number) =>
        bucketDelivered(watts, [], middleBandBounds(ftp)).middleBandSeconds;
      expect(
        result.completedActivities.map((a) => a.middleBandSeconds)
      ).toEqual([lens(200), lens(250)]);
    });

    it("counts a power ride with no FTP instead of dropping it", async () => {
      const deps = createDeps();
      deps.anchors = pinnedAnchors({ athlete: async () => ({ ftp: null }) });
      twoRides(deps, [200, undefined]);

      const result = await createTrainingLoad(deps).summarizeWeek("2026-04-27");

      expect(result.middleBand).toMatchObject({
        ftpRange: { min: 200, max: 200 },
        excludedNoFtp: 1,
        seconds: 3,
      });
      expect(result.completedActivities[1]).toMatchObject({
        middleBandSeconds: null,
        ftp: null,
      });
      expect(deps.activitiesApi.getActivityStreams).toHaveBeenCalledTimes(1);
    });
  });
});

import { describe, it, expect } from "vitest";
import { buildCoachingContext } from "../../src/services/coaching-context/coaching-context.js";
import { createAthleteAnchors } from "../../src/services/athlete-anchors/index.js";
import { createMap } from "../../src/services/map/index.js";
import type {
  AthleteProfile,
  IAthleteApi,
} from "../../src/services/athlete/index.js";
import type {
  IWellnessApi,
  WellnessRecord,
} from "../../src/services/wellness/index.js";
import type {
  Activity,
  ActivityStreams,
  IActivitiesApi,
} from "../../src/services/activities/index.js";
import type {
  IPowerCurvesApi,
  PeakSet,
} from "../../src/services/power-curves/index.js";

function fakeAthleteApi(profile: Partial<AthleteProfile>): IAthleteApi {
  return {
    getAthlete: async () => profile as AthleteProfile,
  };
}

function fakeWellnessApi(records: Partial<WellnessRecord>[]): IWellnessApi {
  return {
    getWellness: async () => records as WellnessRecord[],
    getWellnessDay: async () => records[0] as WellnessRecord,
  };
}

const emptyActivitiesApi: IActivitiesApi = {
  getActivities: async () => [],
  getActivity: async () => ({}) as Activity,
  getActivityStreams: async () => ({}) as ActivityStreams,
};

const emptyPowerCurvesApi: IPowerCurvesApi = {
  getPowerCurve: async () => [],
  getPeaks: async () => ({ p5s: null, p60: null, p5min: null }),
};

function fakePowerCurvesApi(peaks: PeakSet): IPowerCurvesApi {
  return { getPowerCurve: async () => [], getPeaks: async () => peaks };
}

function fakeActivitiesApi(
  activities: Partial<Activity>[],
  streams: Partial<ActivityStreams>
): IActivitiesApi {
  return {
    getActivities: async () => activities as Activity[],
    getActivity: async () => activities[0] as Activity,
    getActivityStreams: async () => streams as ActivityStreams,
  };
}

describe("buildCoachingContext", () => {
  it("synthesises athlete + wellness into one snapshot", async () => {
    const athleteApi = fakeAthleteApi({
      id: "i1",
      name: "Test",
      weight: 72,
      ftp: 285,
      lthr: 168,
      max_hr: 192,
      resting_hr: 48,
      sport_settings: [
        {
          types: ["Ride", "VirtualRide"],
          ftp: 285,
          lthr: 168,
          max_hr: 192,
          threshold_pace: 0,
          power_zones: [55, 75, 90, 105, 120, 150, 999],
          hr_zones: [127, 142, 148, 158, 162, 167, 175],
          pace_zones: null,
        },
      ],
    });
    const wellnessApi = fakeWellnessApi([
      { id: "2026-04-28", ctl: 60, atl: 55, fatigue: 3 } as WellnessRecord,
      { id: "2026-04-29", ctl: 62, atl: 58, fatigue: 4 } as WellnessRecord,
      { id: "2026-04-30", ctl: 64, atl: 50, fatigue: 2 } as WellnessRecord,
    ]);
    const ctx = await buildCoachingContext(
      {
        anchors: createAthleteAnchors({
          athleteApi,
          map: createMap({ activitiesApi: emptyActivitiesApi }),
          powerCurvesApi: emptyPowerCurvesApi,
        }),
        wellnessApi,
      },
      { days: 3, today: "2026-04-30" }
    );

    expect(ctx.asOf).toBe("2026-04-30");
    expect(ctx.daysWindow).toBe(3);
    expect(ctx.athlete.ftp).toBe(285);
    expect(ctx.athlete.hr_zones).toEqual([127, 142, 148, 158, 162, 167, 175]);
    expect(ctx.athlete.pace_zones).toBeNull();
    expect(ctx.mapZones).toBeNull(); // no ramp test in window → no MAP → no zones
    expect(ctx.fitness).toEqual({
      date: "2026-04-30",
      ctl: 64,
      atl: 50,
      tsb: 14,
      ramp_rate: round1((64 - 60) / 3),
    });
    expect(ctx.wellnessTrend).toHaveLength(3);
    expect(ctx.wellnessTrend[0].date).toBe("2026-04-28");
    expect(ctx.wellnessTrend[2].fatigue).toBe(2);
  });

  it("handles missing fields and empty wellness window", async () => {
    const athleteApi = fakeAthleteApi({ id: "i2" });
    const wellnessApi = fakeWellnessApi([]);
    const ctx = await buildCoachingContext(
      {
        anchors: createAthleteAnchors({
          athleteApi,
          map: createMap({ activitiesApi: emptyActivitiesApi }),
          powerCurvesApi: emptyPowerCurvesApi,
        }),
        wellnessApi,
      },
      { today: "2026-05-01" }
    );

    expect(ctx.daysWindow).toBe(7);
    expect(ctx.athlete.ftp).toBeNull();
    expect(ctx.mapZones).toBeNull();
    expect(ctx.athlete.sport_settings_count).toBe(0);
    expect(ctx.fitness).toEqual({
      date: null,
      ctl: null,
      atl: null,
      tsb: null,
      ramp_rate: null,
    });
    expect(ctx.wellnessTrend).toEqual([]);
  });

  it("falls back to icu_-prefixed fields and sportSettings camelCase", async () => {
    const athleteApi = fakeAthleteApi({
      id: "i3",
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ...({
        icu_ftp: 300,
        icu_lthr: 170,
        sportSettings: [
          {
            types: ["Run"],
            ftp: 0,
            lthr: 170,
            max_hr: 188,
            threshold_pace: 4,
            power_zones: null,
            hr_zones: null,
            pace_zones: [60, 90, 120],
          },
        ],
      } as any),
    });
    const wellnessApi = fakeWellnessApi([
      { id: "2026-05-01", ctl: 50, atl: 50 } as WellnessRecord,
    ]);
    const ctx = await buildCoachingContext(
      {
        anchors: createAthleteAnchors({
          athleteApi,
          map: createMap({ activitiesApi: emptyActivitiesApi }),
          powerCurvesApi: emptyPowerCurvesApi,
        }),
        wellnessApi,
      },
      { today: "2026-05-01", days: 1 }
    );

    expect(ctx.athlete.ftp).toBe(300);
    expect(ctx.athlete.lthr).toBe(170);
    expect(ctx.athlete.pace_zones).toEqual([60, 90, 120]);
    expect(ctx.athlete.sport_settings_count).toBe(1);
  });

  it("computes MAP zones from the ramp test, capping NMP with the 5s peak", async () => {
    const athleteApi = fakeAthleteApi({ id: "i4", weight: 72 });
    const wellnessApi = fakeWellnessApi([
      { id: "2026-05-01", ctl: 50, atl: 50 } as WellnessRecord,
    ]);
    const activitiesApi = fakeActivitiesApi(
      [
        {
          id: 1,
          name: "MAP ramp test 2026-04-30",
          start_date_local: "2026-04-30T10:00:00",
        },
      ],
      { watts: new Array(120).fill(400) }
    );
    const powerCurvesApi = fakePowerCurvesApi({
      p5s: 900,
      p60: null,
      p5min: null,
    });

    const ctx = await buildCoachingContext(
      {
        anchors: createAthleteAnchors({
          athleteApi,
          map: createMap({ activitiesApi }),
          powerCurvesApi,
        }),
        wellnessApi,
      },
      { today: "2026-05-01", days: 1 }
    );

    expect(ctx.map?.watts).toBe(400);
    expect(ctx.mapZones).not.toBeNull();
    const l2 = ctx.mapZones?.find((z) => z.name === "L2");
    expect(l2?.lowW).toBe(200); // 0.50 * 400
    expect(l2?.highW).toBe(260); // 0.65 * 400
    const nmp = ctx.mapZones?.find((z) => z.name === "NMP");
    expect(nmp?.lowW).toBe(600); // 1.50 * 400
    expect(nmp?.highW).toBe(900); // capped by the 5s peak, not 2.0 * 400
  });

  it("rejects out-of-range days", async () => {
    const athleteApi = fakeAthleteApi({});
    const wellnessApi = fakeWellnessApi([]);

    await expect(
      buildCoachingContext(
        {
          anchors: createAthleteAnchors({
            athleteApi,
            map: createMap({ activitiesApi: emptyActivitiesApi }),
            powerCurvesApi: emptyPowerCurvesApi,
          }),
          wellnessApi,
        },
        { days: 0 }
      )
    ).rejects.toThrow(/days must be >= 1/);
    await expect(
      buildCoachingContext(
        {
          anchors: createAthleteAnchors({
            athleteApi,
            map: createMap({ activitiesApi: emptyActivitiesApi }),
            powerCurvesApi: emptyPowerCurvesApi,
          }),
          wellnessApi,
        },
        { days: 31 }
      )
    ).rejects.toThrow(/days must be <= 30/);
  });
});

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

import { describe, it, expect } from "vitest";
import { resolveInputs } from "../../../src/services/power-profile/inputs.js";
import { createAthleteAnchors } from "../../../src/services/athlete-anchors/index.js";
import { createMap } from "../../../src/services/map/index.js";
import type {
  Activity,
  ActivityStreams,
  IActivitiesApi,
} from "../../../src/services/activities/index.js";
import type {
  AthleteProfile,
  IAthleteApi,
} from "../../../src/services/athlete/index.js";
import type {
  IPowerCurvesApi,
  PeakSet,
} from "../../../src/services/power-curves/index.js";

const ATHLETE: Partial<AthleteProfile> = {
  id: "i1",
  name: "Test",
  sex: "M",
  icu_weight: 70,
  icu_date_of_birth: "1985-04-01",
  height: 1.8, // metres
  sportSettings: [
    {
      types: ["Ride", "VirtualRide"],
      ftp: 280,
      lthr: 160,
      max_hr: 180,
      threshold_pace: 0,
      power_zones: [],
      hr_zones: [],
      pace_zones: [],
    },
  ],
};

function fakeAthlete(profile: Partial<AthleteProfile> = ATHLETE): IAthleteApi {
  return {
    getAthlete: async () => profile as AthleteProfile,
  };
}

function fakeActivities(): IActivitiesApi {
  return {
    getActivities: async () => [
      {
        id: 1,
        name: "MAP ramp test",
        start_date_local: "2026-04-01T10:00:00",
      } as Activity,
    ],
    getActivity: async () => ({}) as Activity,
    getActivityStreams: async () => {
      const watts = new Array(900).fill(100);
      for (let i = 700; i < 760; i++) watts[i] = 380;
      return { watts } as ActivityStreams;
    },
  };
}

function fakePowerCurves(peaks: PeakSet): IPowerCurvesApi {
  return {
    getPowerCurve: async () => [],
    getPeaks: async () => peaks,
  };
}

const CURVE_PEAKS: PeakSet = { p5s: 1050, p60: 540, p5min: 370 };

describe("resolveInputs", () => {
  it("auto-resolves from API + derives masters from age", async () => {
    const inputs = await resolveInputs(
      {
        anchors: createAthleteAnchors({
          athleteApi: fakeAthlete(),
          map: createMap({ activitiesApi: fakeActivities() }),
          powerCurvesApi: fakePowerCurves(CURVE_PEAKS),
        }),
        powerCurvesApi: fakePowerCurves(CURVE_PEAKS),
      },
      {},
      { today: "2026-05-01" }
    );

    expect(inputs.mapWatts.value).toBe(380);
    expect(inputs.mapWatts.source).toBe("mapDerivation");
    expect(inputs.weightKg.value).toBe(70);
    expect(inputs.weightKg.source).toBe("athlete");
    expect(inputs.ftpWatts.value).toBe(280);
    expect(inputs.ftpWatts.source).toBe("athlete");
    expect(inputs.sex.value).toBe("male");
    expect(inputs.age.value).toBe(41); // born 1985-04-01, today 2026-05-01
    expect(inputs.masters.value).toBe(true);
    expect(inputs.masters.source).toBe("derived");
    expect(inputs.heightCm.value).toBe(180); // 1.8 m → 180 cm
    expect(inputs.p5s.value).toBe(1050);
    expect(inputs.p60.value).toBe(540);
    expect(inputs.p5min.value).toBe(370);
    expect(inputs.p5s.source).toBe("powerCurve");
  });

  it("overrides take precedence over API values", async () => {
    const inputs = await resolveInputs(
      {
        anchors: createAthleteAnchors({
          athleteApi: fakeAthlete(),
          map: createMap({ activitiesApi: fakeActivities() }),
          powerCurvesApi: fakePowerCurves(CURVE_PEAKS),
        }),
        powerCurvesApi: fakePowerCurves(CURVE_PEAKS),
      },
      {
        mapWatts: 400,
        weightKg: 75,
        sex: "female",
        age: 30,
        heightCm: 170,
        p5s: 1200,
        masters: false,
      },
      { today: "2026-05-01" }
    );

    expect(inputs.mapWatts.value).toBe(400);
    expect(inputs.mapWatts.source).toBe("override");
    expect(inputs.weightKg.value).toBe(75);
    expect(inputs.sex.value).toBe("female");
    expect(inputs.age.value).toBe(30);
    expect(inputs.heightCm.value).toBe(170);
    expect(inputs.p5s.value).toBe(1200);
    expect(inputs.masters.value).toBe(false);
    expect(inputs.masters.source).toBe("override");
  });

  it("warns when MAP cannot be derived and no override given", async () => {
    const noActivities: IActivitiesApi = {
      getActivities: async () => [],
      getActivity: async () => ({}) as Activity,
      getActivityStreams: async () => ({}) as ActivityStreams,
    };

    const inputs = await resolveInputs(
      {
        anchors: createAthleteAnchors({
          athleteApi: fakeAthlete(),
          map: createMap({ activitiesApi: noActivities }),
          powerCurvesApi: fakePowerCurves(CURVE_PEAKS),
        }),
        powerCurvesApi: fakePowerCurves(CURVE_PEAKS),
      },
      {},
      { today: "2026-05-01" }
    );

    expect(inputs.mapWatts.value).toBeNull();
    expect(inputs.mapWatts.source).toBe("missing");
    expect(inputs.warnings.length).toBeGreaterThan(0);
    expect(inputs.warnings[0]).toMatch(/MAP ramp test/);
  });

  it("falls back gracefully when power curve fails", async () => {
    const failingCurves: IPowerCurvesApi = {
      getPowerCurve: async () => {
        throw new Error("network");
      },
      getPeaks: async () => {
        throw new Error("network");
      },
    };

    const inputs = await resolveInputs(
      {
        anchors: createAthleteAnchors({
          athleteApi: fakeAthlete(),
          map: createMap({ activitiesApi: fakeActivities() }),
          powerCurvesApi: failingCurves,
        }),
        powerCurvesApi: failingCurves,
      },
      {},
      { today: "2026-05-01" }
    );

    expect(inputs.p5s.value).toBeNull();
    expect(inputs.warnings.some((w) => /power curve/i.test(w))).toBe(true);
  });

  it("handles missing date_of_birth without crashing", async () => {
    const inputs = await resolveInputs(
      {
        anchors: createAthleteAnchors({
          athleteApi: fakeAthlete({
            ...ATHLETE,
            icu_date_of_birth: null,
          } as Partial<AthleteProfile>),
          map: createMap({ activitiesApi: fakeActivities() }),
          powerCurvesApi: fakePowerCurves(CURVE_PEAKS),
        }),
        powerCurvesApi: fakePowerCurves(CURVE_PEAKS),
      },
      {},
      { today: "2026-05-01" }
    );

    expect(inputs.age.value).toBeNull();
    expect(inputs.age.source).toBe("missing");
    expect(inputs.masters.value).toBeNull();
  });
});

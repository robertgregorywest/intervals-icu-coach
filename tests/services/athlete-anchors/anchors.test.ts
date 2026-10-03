import { describe, it, expect } from "vitest";
import { createAthleteAnchors } from "../../../src/services/athlete-anchors/index.js";
import { computeMapZones } from "../../../src/shared/map-zones.js";
import { createAthleteAnchorsFrom } from "../../../src/services/athlete-anchors/anchors.js";
import { createMap } from "../../../src/services/map/index.js";
import type { IAthleteApi } from "../../../src/services/athlete/index.js";
import type {
  Activity,
  ActivityStreams,
  IActivitiesApi,
} from "../../../src/services/activities/index.js";
import type { IPowerCurvesApi } from "../../../src/services/power-curves/index.js";

/**
 * The athlete as the live API returns it: the list is `sportSettings`, FTP and
 * zones live on the cycling entry only, and `weight` is null beside
 * `icu_weight`.
 */
const ATHLETE = {
  id: "i1",
  name: "Test",
  weight: null,
  icu_weight: 68.2,
  icu_resting_hr: 46,
  sportSettings: [
    {
      types: ["Run", "VirtualRun"],
      ftp: null,
      lthr: 165,
      max_hr: 180,
      power_zones: null,
      hr_zones: null,
      pace_zones: [77, 88, 94, 100, 103, 111, 999],
    },
    {
      types: ["Ride", "VirtualRide", "TrackRide"],
      ftp: 286,
      lthr: 159,
      max_hr: 172,
      power_zones: [55, 75, 90, 105, 120, 150, 999],
      hr_zones: [127, 142, 148, 158, 162, 167, 175],
      pace_zones: null,
    },
  ],
};

/** The anchors over one athlete record, read the way production reads it. */
function read(record: unknown) {
  return createAthleteAnchors({
    athleteApi: { getAthlete: async () => record as never },
    map: createMap({ activitiesApi: {} as IActivitiesApi }),
    powerCurvesApi: {} as IPowerCurvesApi,
    today: () => "2026-09-10",
  }).getAthleteAnchors();
}

describe("getAthleteAnchors — the one athlete-record reader", () => {
  it("reads the live payload's cycling settings and icu_weight", async () => {
    const f = await read(ATHLETE);
    expect(f.ftp).toBe(286);
    expect(f.weight).toBe(68.2);
    expect(f.lthr).toBe(159);
    expect(f.maxHr).toBe(172);
    expect(f.restingHr).toBe(46);
    expect(f.powerZones).toEqual([55, 75, 90, 105, 120, 150, 999]);
    expect(f.hrZones).toEqual([127, 142, 148, 158, 162, 167, 175]);
    expect(f.paceZones).toBeNull();
    expect(f.sportSettings).toHaveLength(2);
  });

  it("reads the typed profile's snake_case sport settings the same way", async () => {
    const { sportSettings, ...rest } = ATHLETE;
    expect((await read({ ...rest, sport_settings: sportSettings })).ftp).toBe(
      286
    );
  });

  it("prefers the sport settings' FTP over a top-level one", async () => {
    expect((await read({ ...ATHLETE, icu_ftp: 250, ftp: 240 })).ftp).toBe(286);
  });

  it("falls back to the top-level FTP, icu_ftp first, when the settings carry none", async () => {
    expect((await read({ icu_ftp: 250, ftp: 240 })).ftp).toBe(250);
    expect((await read({ ftp: 240 })).ftp).toBe(240);
  });

  it("reads a zero or negative number as unset, not as an anchor", async () => {
    const f = await read({
      icu_weight: 0,
      weight: 70,
      sportSettings: [{ types: ["Ride"], ftp: 0 }],
      icu_ftp: -1,
    });
    expect(f.weight).toBe(70);
    expect(f.ftp).toBeNull();
  });

  it("reads sex, date of birth and height as the record stores them", async () => {
    const f = await read({
      sex: "M",
      icu_date_of_birth: "1985-04-01",
      height: 1.8,
    });
    expect(f).toMatchObject({
      sex: "M",
      dateOfBirth: "1985-04-01",
      height: 1.8,
    });
    expect((await read({ birthday: "1990-01-01" })).dateOfBirth).toBe(
      "1990-01-01"
    );
  });

  it("answers null for an empty or missing record", async () => {
    expect(await read(null)).toMatchObject({
      ftp: null,
      weight: null,
      powerZones: null,
      sportSettings: [],
    });
  });
});

function harness() {
  const calls: string[] = [];
  const athleteApi: IAthleteApi = {
    getAthlete: async () => {
      calls.push("athlete");
      return ATHLETE as never;
    },
  };
  const activitiesApi = {
    getActivities: async () => {
      calls.push("activities");
      return [
        {
          id: "i9",
          name: "MAP ramp test",
          start_date_local: "2026-09-01T08:00:00",
        },
      ] as Activity[];
    },
    getActivityStreams: async () => {
      calls.push("streams");
      return { watts: Array(120).fill(400) } as ActivityStreams;
    },
  } as unknown as IActivitiesApi;
  const powerCurvesApi: IPowerCurvesApi = {
    getPowerCurve: async () => [],
    getPeaks: async () => {
      calls.push("curve");
      return { p5s: 1000, p60: null, p5min: null };
    },
  };
  const anchors = createAthleteAnchors({
    athleteApi,
    map: createMap({ activitiesApi }),
    powerCurvesApi,
    today: () => "2026-09-10",
  });
  return { anchors, calls };
}

describe("AthleteAnchorsService", () => {
  it("answers FTP, weight and power zones from one athlete request", async () => {
    const { anchors, calls } = harness();
    expect(await anchors.getAthleteAnchors()).toMatchObject({
      ftp: 286,
      weight: 68.2,
      powerZones: [55, 75, 90, 105, 120, 150, 999],
    });
    expect(calls).toEqual(["athlete"]);
  });

  it("derives MAP and its zones without reading the athlete record", async () => {
    const { anchors, calls } = harness();
    const { map, mapZones } = await anchors.getMapAnchors();
    expect(map?.watts).toBe(400);
    expect(mapZones?.length).toBeGreaterThan(0);
    expect(calls).not.toContain("athlete");
  });
});

describe("snapshot — each anchor read at most once per call", () => {
  it("fetches the athlete once however many readers ask", async () => {
    const { anchors, calls } = harness();
    const snap = anchors.snapshot();
    await Promise.all([
      snap.getAthleteAnchors(),
      snap.getAthleteAnchors(),
      snap.getMapAnchors(),
      snap.getMapAnchors(),
    ]);
    expect(calls.filter((c) => c === "athlete")).toHaveLength(1);
    expect(calls.filter((c) => c === "curve")).toHaveLength(1);
  });

  it("leaves the anchors themselves unmemoised, so a later call sees a new FTP", async () => {
    const { anchors, calls } = harness();
    await anchors.getAthleteAnchors();
    await anchors.getAthleteAnchors();
    expect(calls.filter((c) => c === "athlete")).toHaveLength(2);
  });
});

describe("computeMapZones", () => {
  it("returns 9 zones with watts derived from MAP", () => {
    const zones = computeMapZones(360, null);
    expect(zones).toHaveLength(9);
    expect(zones[0]).toMatchObject({
      name: "REC",
      lowW: 0,
      highW: 144,
      pctText: "0–40%",
    });
    expect(zones[7]).toMatchObject({
      name: "L7",
      lowW: 396,
      highW: 540,
    });
    expect(zones[8].name).toBe("NMP");
    expect(zones[8].pctText).toBe("150%+");
    expect(zones[8].wattText).toBe("540 W and above");
  });

  it("caps NMP high end to p5s when provided", () => {
    const zones = computeMapZones(360, 1100);
    expect(zones[8].highW).toBe(1100);
    expect(zones[8].wattText).toBe("540–1100 W");
  });
});

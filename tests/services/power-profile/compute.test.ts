import { describe, it, expect } from "vitest";
import {
  computeFtpCheck,
  computePstsSection,
  computeCompound,
  computeVo2,
  computeAllometric,
  computeTpProfile,
  computeRiderType,
  computeMapBand,
  computeTtEstimates,
  computeRaceEstimates,
  computePowerProfile,
} from "../../../src/services/power-profile/compute.js";
import type { ResolvedInputs } from "../../../src/services/power-profile/index.js";

function field<T>(value: T | null): { value: T | null; source: "override" } {
  return { value, source: "override" };
}

function inputs(over: Partial<Record<string, unknown>> = {}): ResolvedInputs {
  return {
    mapWatts: field(360),
    weightKg: field(70),
    ftpWatts: field(280),
    sex: field("male"),
    age: field(35),
    heightCm: field(180),
    p5s: field(1100),
    p60: field(550),
    p5min: field(380),
    aeroPosition: field("road_drops"),
    cdaKnown: field(null),
    discipline: field(null),
    history: field(null),
    strength: field(null),
    weeklyHours: field(null),
    masters: field(false),
    warnings: [],
    ...over,
  } as ResolvedInputs;
}

describe("computeFtpCheck", () => {
  it("flags FTP > 77% of MAP as high", () => {
    const check = computeFtpCheck(360, 285);
    expect(check.estFtpRange).toEqual([259, 277]);
    expect(check.status).toBe("high");
    expect(check.ratioPct).toBeCloseTo(79.17, 1);
  });

  it("returns typical when ratio is in [0.72, 0.77]", () => {
    const check = computeFtpCheck(360, 270);
    expect(check.status).toBe("typical");
  });

  it("returns low when ratio < 0.72", () => {
    const check = computeFtpCheck(360, 240);
    expect(check.status).toBe("low");
  });

  it("returns missing when no FTP supplied", () => {
    const check = computeFtpCheck(360, null);
    expect(check.status).toBe("missing");
    expect(check.ratioPct).toBeNull();
  });
});

describe("computeVo2", () => {
  it("uses 7 + 9.8*(MAP/kg) and classifies on adult bands", () => {
    const v = computeVo2(360, 70, "male", 35, false);
    expect(v).not.toBeNull();
    expect(v!.ml_kg_min).toBeCloseTo(57.4, 1);
    expect(v!.baseCategory).toBe("Very Good");
    expect(v!.ageAdjusted).toBeNull();
    expect(v!.isMastersByAge).toBe(false);
  });

  it("computes age-adjusted VO₂ for masters athletes", () => {
    const v = computeVo2(360, 70, "male", 50, true);
    expect(v!.isMastersByAge).toBe(true);
    // factor = 1 + 0.01 * (50 - 40) = 1.10
    expect(v!.ageAdjusted!.value).toBeCloseTo(57.4 * 1.1, 1);
  });

  it("returns null when weight missing", () => {
    expect(computeVo2(360, null, "male", 35, false)).toBeNull();
  });
});

describe("computeAllometric", () => {
  it("uses mass^0.67 and male threshold 29", () => {
    const a = computeAllometric(360, 70, "male");
    expect(a!.wkg067).toBeCloseTo(20.9, 1);
    expect(a!.threshold).toBe(29);
    expect(a!.pctOfThreshold).toBeCloseTo(72, 0);
  });

  it("uses female threshold 21", () => {
    const a = computeAllometric(280, 60, "female");
    expect(a!.threshold).toBe(21);
  });

  it("returns null without sex", () => {
    expect(computeAllometric(360, 70, null)).toBeNull();
  });
});

describe("computeCompound", () => {
  it("classifies p5min²/kg into bands", () => {
    const c = computeCompound(380, 70, "male");
    expect(c!.score).toBeCloseTo(2062.86, 1);
    expect(c!.band).toBe("exceptional");
    expect(c!.pctU23).toBeCloseTo(66.3, 0);
    expect(c!.pctMasters).toBeCloseTo(103.1, 0);
  });

  it("scales thresholds 0.85x for female", () => {
    // score 800 < 900 male t1 (modest) → 800 / 0.85 = 941 effective relative to male, so female t1=765
    const c = computeCompound(250, 78, "female");
    // 250^2/78 = 801.28; t1_f = 765 → solid (>=765, <1105)
    expect(c!.score).toBeCloseTo(801.28, 1);
    expect(c!.band).toBe("solid");
  });

  it("returns null without weight or p5min", () => {
    expect(computeCompound(null, 70, "male")).toBeNull();
    expect(computeCompound(380, null, "male")).toBeNull();
  });
});

describe("computePstsSection", () => {
  it("estimates CdA from height+mass+position and computes PSTS", () => {
    const psts = computePstsSection(360, 280, 70, {
      heightCm: 180,
      massKg: 70,
      position: "road_drops",
      knownCda: null,
    });
    expect(psts).not.toBeNull();
    expect(psts!.cda).toBeCloseTo(0.2602, 3);
    expect(psts!.cdaMethod).toBe("estimated");
    expect(psts!.mapPsts).toBe(84);
    expect(psts!.ftpPsts).toBe(66);
  });

  it("uses 0.75*MAP as the FTP estimate when FTP missing", () => {
    const psts = computePstsSection(360, null, 70, {
      heightCm: 180,
      massKg: 70,
      position: "road_drops",
      knownCda: null,
    });
    expect(psts!.ftpUsedForPsts).toBeCloseTo(270, 1);
  });

  it("returns null without position or knownCda", () => {
    expect(
      computePstsSection(360, 280, 70, {
        heightCm: 180,
        massKg: 70,
        position: null,
        knownCda: null,
      })
    ).toBeNull();
  });
});

describe("computeTpProfile + computeRiderType", () => {
  it("classifies each duration and picks rider shape", () => {
    const tp = computeTpProfile(360, 70, "male", 1100, 550, 380, 280);
    expect(tp).not.toBeNull();
    expect(tp!.rows).toHaveLength(4);
    expect(tp!.categories["5s"]).toBe("Good");
    expect(tp!.categories["1min"]).toBe("Good");
    expect(tp!.categories["5min"]).toBe("Very Good");
    expect(tp!.categories["FTP"]).toBe("Very Good");

    const rider = computeRiderType(tp!.categories, false);
    expect(rider!.shape).toBe("up-sloping");
    expect(rider!.label).toContain("time-trialist");
  });

  it("flags sprinter shape when short categories outrank long", () => {
    // 5s World Class (1750), 60s Excellent, 5min Fair, FTP Fair
    const tp = computeTpProfile(360, 70, "male", 1750, 650, 220, 170);
    const rider = computeRiderType(tp!.categories, false);
    expect(rider!.shape).toBe("down-sloping");
    expect(rider!.label).toContain("sprinter");
  });

  it("returns null when too few categories resolved", () => {
    const tp = computeTpProfile(360, 70, "male", null, null, 380, null);
    // Only 5min + derived FTP = 2 categories → rider type returns null
    const rider = computeRiderType(tp!.categories, false);
    expect(rider).toBeNull();
  });
});

describe("computeMapBand", () => {
  it.each([
    ["male", 240, 70, "Untrained / recreational"], // 3.43 W/kg < 4.0
    ["male", 360, 70, "Competitive amateur"], // 5.14 W/kg in [5.0, 6.0)
    ["male", 410, 70, "Competitive amateur"], // 5.86 W/kg in [5.0, 6.0)
    ["male", 500, 70, "Elite amateur / semi-pro"], // 7.14 W/kg in [6.0, 7.5)
    ["female", 190, 60, "Untrained / recreational"], // 3.17 W/kg < 3.3
    ["female", 280, 60, "Competitive amateur"], // 4.67 W/kg in [4.3, 5.0)
  ] as const)("classifies %s %iW/%ikg → %s", (sex, map, kg, band) => {
    const result = computeMapBand(map, kg, sex);
    expect(result!.band).toBe(band);
  });
});

describe("computeTtEstimates + computeRaceEstimates", () => {
  it("returns 6 TT events with watts and percentages", () => {
    const tt = computeTtEstimates(360);
    expect(tt).toHaveLength(6);
    expect(tt[0]).toMatchObject({ distance: "3 km TT", lowW: 320, highW: 328 });
    expect(tt[3]).toMatchObject({
      distance: "40.2 km TT",
      lowW: 259,
      highW: 277,
    });
  });

  it("scales race estimates by mass^0.67", () => {
    const races = computeRaceEstimates(70);
    expect(races).not.toBeNull();
    expect(races![0]).toMatchObject({
      event: "road_race",
      lowW: 189,
      highW: 241,
    });
    expect(races![1]).toMatchObject({
      event: "crit",
      lowW: 241,
      highW: 310,
    });
  });
});

describe("computePowerProfile (end-to-end)", () => {
  it("produces all sections from resolved inputs", () => {
    const result = computePowerProfile(inputs());
    expect(result.zones).toHaveLength(9);
    expect(result.ftpCheck.status).toBe("high");
    expect(result.psts?.mapPsts).toBe(84);
    expect(result.compound?.band).toBe("exceptional");
    expect(result.vo2max?.baseCategory).toBe("Very Good");
    expect(result.allometricMap?.threshold).toBe(29);
    expect(result.tpProfile).toHaveLength(4);
    expect(result.riderType?.shape).toBe("up-sloping");
    expect(result.mapBand?.band).toBe("Competitive amateur");
    expect(result.ttEstimates).toHaveLength(6);
    expect(result.raceEstimates).toHaveLength(2);
    expect(result.source.formulasFrom).toContain("cyclecoach.com");
  });

  it("throws when MAP is missing", () => {
    expect(() =>
      computePowerProfile(inputs({ mapWatts: field(null) }))
    ).toThrow(/MAP is required/);
  });

  it("omits sections that need data not present", () => {
    const result = computePowerProfile(
      inputs({
        weightKg: field(null),
        sex: field(null),
        aeroPosition: field(null),
        p5min: field(null),
      })
    );
    expect(result.psts).toBeNull();
    expect(result.compound).toBeNull();
    expect(result.vo2max).toBeNull();
    expect(result.allometricMap).toBeNull();
    expect(result.tpProfile).toBeNull();
    expect(result.mapBand).toBeNull();
    expect(result.raceEstimates).toBeNull();
    // Zones, FTP check, and TT estimates only need MAP
    expect(result.zones).toHaveLength(9);
    expect(result.ttEstimates).toHaveLength(6);
  });
});

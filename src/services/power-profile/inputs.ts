import type { IPowerCurvesApi } from "../power-curves/index.js";
import type { IAthleteAnchors } from "../athlete-anchors/index.js";
import { isoToday } from "../../shared/clock.js";
import type {
  InputField,
  InputSource,
  PowerProfileOverrides,
  ResolvedInputs,
  Sex,
} from "./types.js";

export interface PowerProfileDeps {
  /** Weight, FTP, sex, age, height and MAP — the athlete's side of the inputs. */
  anchors: IAthleteAnchors;
  /** The peaks, at whatever range the caller asks for. */
  powerCurvesApi: IPowerCurvesApi;
}

export interface ResolveOptions {
  today?: string;
}

const field = <T>(
  value: T | null,
  source: InputSource,
  note?: string
): InputField<T> => ({ value, source, ...(note ? { note } : {}) });

const missing = <T>(): InputField<T> => ({ value: null, source: "missing" });

export async function resolveInputs(
  deps: PowerProfileDeps,
  overrides: PowerProfileOverrides = {},
  opts: ResolveOptions = {}
): Promise<ResolvedInputs> {
  const today = opts.today ?? isoToday();
  const warnings: string[] = [];

  const [fields, mapDerivation] = await Promise.all([
    deps.anchors.getAthleteAnchors().catch(() => null),
    overrides.mapWatts != null
      ? Promise.resolve(null)
      : deps.anchors.getMapAnchors({ today }),
  ]);

  // weight
  let weightKg: InputField<number>;
  if (overrides.weightKg != null) {
    weightKg = field(overrides.weightKg, "override");
  } else {
    const w = fields?.weight ?? null;
    weightKg = w != null ? field(w, "athlete") : missing<number>();
  }

  let ftpWatts: InputField<number>;
  if (overrides.ftpWatts != null) {
    ftpWatts = field(overrides.ftpWatts, "override");
  } else {
    const v = fields?.ftp ?? null;
    ftpWatts = v != null ? field(v, "athlete") : missing<number>();
  }

  // sex (M/F → male/female)
  let sex: InputField<Sex>;
  if (overrides.sex) {
    sex = field(overrides.sex, "override");
  } else {
    const raw = fields?.sex;
    const mapped =
      raw === "M" || raw === "male"
        ? "male"
        : raw === "F" || raw === "female"
          ? "female"
          : null;
    sex = mapped ? field<Sex>(mapped, "athlete") : missing<Sex>();
  }

  // age from icu_date_of_birth / date_of_birth / birthday
  let age: InputField<number>;
  if (overrides.age != null) {
    age = field(overrides.age, "override");
  } else {
    const dob = fields?.dateOfBirth;
    const computed = dob ? computeAgeFromDob(dob, today) : null;
    age = computed != null ? field(computed, "derived") : missing<number>();
  }

  // height — Intervals.icu stores top-level `height` in METRES
  let heightCm: InputField<number>;
  if (overrides.heightCm != null) {
    heightCm = field(overrides.heightCm, "override");
  } else {
    const h = fields?.height ?? null;
    if (h != null) {
      const cm = h <= 3 ? h * 100 : h; // metres → cm if value looks like metres
      heightCm = field(cm, "athlete");
    } else {
      heightCm = missing<number>();
    }
  }

  // power curve peaks (5/60/300s)
  let p5s: InputField<number> = missing<number>();
  let p60: InputField<number> = missing<number>();
  let p5min: InputField<number> = missing<number>();

  if (overrides.p5s != null) p5s = field(overrides.p5s, "override");
  if (overrides.p60 != null) p60 = field(overrides.p60, "override");
  if (overrides.p5min != null) p5min = field(overrides.p5min, "override");

  const needCurve =
    overrides.p5s == null || overrides.p60 == null || overrides.p5min == null;
  if (needCurve) {
    try {
      const peaks = await deps.powerCurvesApi.getPeaks({
        range: overrides.powerCurveRange ?? "90d",
        type: "Ride",
      });
      if (overrides.p5s == null && peaks.p5s != null)
        p5s = field(peaks.p5s, "powerCurve");
      if (overrides.p60 == null && peaks.p60 != null)
        p60 = field(peaks.p60, "powerCurve");
      if (overrides.p5min == null && peaks.p5min != null)
        p5min = field(peaks.p5min, "powerCurve");
    } catch {
      warnings.push(
        "Could not load power curve; p5s/p60/p5min unavailable unless provided."
      );
    }
  }

  // map
  let mapWatts: InputField<number>;
  if (overrides.mapWatts != null) {
    mapWatts = field(overrides.mapWatts, "override");
  } else if (mapDerivation?.map) {
    mapWatts = field(
      mapDerivation.map.watts,
      "mapDerivation",
      `from activity "${mapDerivation.map.computedFrom.activityName}" on ${mapDerivation.map.computedFrom.activityDate}`
    );
  } else {
    mapWatts = missing<number>();
    if (mapDerivation?.mapWarning) warnings.push(mapDerivation.mapWarning);
  }

  // masters — auto from age >= 40, override wins
  let masters: InputField<boolean>;
  if (overrides.masters != null) {
    masters = field(overrides.masters, "override");
  } else if (age.value != null && age.value >= 40) {
    masters = field(true, "derived");
  } else if (age.value != null) {
    masters = field(false, "derived");
  } else {
    masters = missing<boolean>();
  }

  return {
    mapWatts,
    weightKg,
    ftpWatts,
    sex,
    age,
    heightCm,
    p5s,
    p60,
    p5min,
    aeroPosition:
      overrides.aeroPosition != null
        ? field(overrides.aeroPosition, "override")
        : missing<ResolvedInputs["aeroPosition"]["value"] & string>(),
    cdaKnown:
      overrides.cdaKnown != null
        ? field(overrides.cdaKnown, "override")
        : missing<number>(),
    discipline:
      overrides.discipline != null
        ? field(overrides.discipline, "override")
        : missing<ResolvedInputs["discipline"]["value"] & string>(),
    history:
      overrides.history != null
        ? field(overrides.history, "override")
        : missing<ResolvedInputs["history"]["value"] & string>(),
    strength:
      overrides.strength != null
        ? field(overrides.strength, "override")
        : missing<ResolvedInputs["strength"]["value"] & string>(),
    weeklyHours:
      overrides.weeklyHours != null
        ? field(overrides.weeklyHours, "override")
        : missing<number>(),
    masters,
    warnings,
  };
}

function computeAgeFromDob(dob: string, today: string): number | null {
  const d = Date.parse(dob);
  const t = Date.parse(today);
  if (Number.isNaN(d) || Number.isNaN(t)) return null;
  const dobDate = new Date(d);
  const todayDate = new Date(t);
  let years = todayDate.getUTCFullYear() - dobDate.getUTCFullYear();
  const m = todayDate.getUTCMonth() - dobDate.getUTCMonth();
  if (m < 0 || (m === 0 && todayDate.getUTCDate() < dobDate.getUTCDate())) {
    years--;
  }
  return years >= 0 && years < 130 ? years : null;
}

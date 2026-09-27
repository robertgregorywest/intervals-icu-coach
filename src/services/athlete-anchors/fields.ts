import type { SportSetting } from "../athlete/index.js";
import type { AthleteAnchors } from "./types.js";

/**
 * The one athlete-record reader. See `AthleteAnchors` for how the record is
 * read.
 */
export function readAthlete(raw: unknown): AthleteAnchors {
  const athlete = (raw ?? {}) as Record<string, unknown>;
  const sportSettings = sportSettingsOf(athlete);
  const cycling = pickCycling(sportSettings);
  const sport = (cycling ?? {}) as Record<string, unknown>;

  return {
    id: pickString(athlete, "id"),
    name: pickString(athlete, "name"),
    sex: pickString(athlete, "sex"),
    dateOfBirth:
      pickString(athlete, "icu_date_of_birth") ??
      pickString(athlete, "date_of_birth") ??
      pickString(athlete, "birthday"),
    height: positiveNumber(athlete, ["height"]),
    ftp:
      positiveNumber(sport, ["ftp"]) ??
      positiveNumber(athlete, ["icu_ftp", "ftp"]),
    weight: positiveNumber(athlete, ["icu_weight", "weight"]),
    lthr:
      positiveNumber(sport, ["lthr"]) ??
      positiveNumber(athlete, ["icu_lthr", "lthr"]),
    maxHr:
      positiveNumber(sport, ["max_hr"]) ??
      positiveNumber(athlete, ["icu_max_hr", "max_hr"]),
    restingHr: positiveNumber(athlete, ["icu_resting_hr", "resting_hr"]),
    powerZones: nonEmpty(cycling?.power_zones),
    hrZones: nonEmpty(cycling?.hr_zones),
    paceZones: nonEmpty(cycling?.pace_zones),
    sportSettings,
    cycling,
  };
}

/** The first positive, finite number among `keys`, in order. */
export function positiveNumber(
  obj: Record<string, unknown> | null | undefined,
  keys: string[]
): number | null {
  if (!obj) return null;
  for (const k of keys) {
    const v = obj[k];
    if (typeof v === "number" && Number.isFinite(v) && v > 0) return v;
  }
  return null;
}

function sportSettingsOf(athlete: Record<string, unknown>): SportSetting[] {
  const settings = athlete.sportSettings ?? athlete.sport_settings;
  return Array.isArray(settings) ? (settings as SportSetting[]) : [];
}

function pickCycling(settings: SportSetting[]): SportSetting | undefined {
  return (
    settings.find((s) =>
      (s.types ?? []).some((t) => /ride|cycl|bike/i.test(t))
    ) ?? settings[0]
  );
}

function pickString(obj: Record<string, unknown>, key: string): string | null {
  const v = obj[key];
  return typeof v === "string" && v.length > 0 ? v : null;
}

function nonEmpty(zones: number[] | null | undefined): number[] | null {
  return zones && zones.length ? zones : null;
}

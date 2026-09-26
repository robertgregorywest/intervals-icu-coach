import type { IAthleteApi } from "../athlete/index.js";
import type { IWellnessApi, WellnessRecord } from "../wellness/index.js";
import type { IActivitiesApi } from "../activities/index.js";
import type { IPowerCurvesApi } from "../power-curves/index.js";
import { isoToday } from "../../clock.js";
import { shiftDate } from "../../dates.js";
import { deriveMapAnchors, readAthlete } from "../athlete-anchors/index.js";
import type {
  AthleteSnapshot,
  CoachingContext,
  FitnessSnapshot,
  WellnessTrendPoint,
} from "./types.js";

export interface CoachingContextDeps {
  athleteApi: IAthleteApi;
  wellnessApi: IWellnessApi;
  activitiesApi: IActivitiesApi;
  powerCurvesApi: IPowerCurvesApi;
}

export interface CoachingContextOptions {
  days?: number;
  today?: string;
}

export const DEFAULT_DAYS = 7;
export const MAX_DAYS = 30;

export async function buildCoachingContext(
  deps: CoachingContextDeps,
  opts: CoachingContextOptions = {}
): Promise<CoachingContext> {
  const days = clampDays(opts.days);
  const today = opts.today ?? isoToday();
  const oldest = shiftDate(today, -(days - 1));

  // MAP zones come from the Athlete anchors module, the one place they are
  // derived; the athlete record is read through its field reader.
  const [athleteRaw, wellnessRaw, { map, mapZones, mapWarning }] =
    await Promise.all([
      deps.athleteApi.getAthlete(),
      deps.wellnessApi.getWellness(oldest, today),
      deriveMapAnchors(deps, today),
    ]);

  const athlete = summarizeAthlete(athleteRaw);
  const trend = summarizeTrend(wellnessRaw);
  const fitness = pickFitnessSnapshot(trend);

  return {
    asOf: today,
    daysWindow: days,
    athlete,
    fitness,
    wellnessTrend: trend,
    map,
    mapZones,
    ...(mapWarning ? { mapWarning } : {}),
  };
}

function clampDays(input?: number): number {
  if (input == null) return DEFAULT_DAYS;
  if (!Number.isFinite(input) || input < 1) {
    throw new Error(`days must be >= 1, got ${input}`);
  }
  if (input > MAX_DAYS) {
    throw new Error(`days must be <= ${MAX_DAYS}, got ${input}`);
  }
  return Math.floor(input);
}

function summarizeAthlete(raw: unknown): AthleteSnapshot {
  const f = readAthlete(raw);
  return {
    id: f.id,
    name: f.name,
    weight: f.weight,
    ftp: f.ftp,
    lthr: f.lthr,
    max_hr: f.maxHr,
    resting_hr: f.restingHr,
    hr_zones: f.hrZones,
    pace_zones: f.paceZones,
    sport_settings_count: f.sportSettings.length,
  };
}

function summarizeTrend(records: WellnessRecord[]): WellnessTrendPoint[] {
  return [...records]
    .sort((a, b) => String(a.id).localeCompare(String(b.id)))
    .map((r) => {
      const ctl = numeric(r.ctl);
      const atl = numeric(r.atl);
      return {
        date: String(r.id),
        ctl: round1(ctl),
        atl: round1(atl),
        tsb: round1(ctl - atl),
        fatigue: r.fatigue,
        soreness: r.soreness,
        motivation: r.motivation,
        mood: r.mood,
        stress: r.stress,
        readiness: r.readiness,
        sleep_secs: r.sleepSecs,
        sleep_score: r.sleepScore,
        resting_hr: r.restingHR,
        hrv: r.hrv,
      };
    });
}

function pickFitnessSnapshot(trend: WellnessTrendPoint[]): FitnessSnapshot {
  if (!trend.length) {
    return {
      date: null,
      ctl: null,
      atl: null,
      tsb: null,
      ramp_rate: null,
    };
  }
  const last = trend[trend.length - 1];
  const first = trend[0];
  const rampRate =
    trend.length > 1 ? round1((last.ctl - first.ctl) / trend.length) : 0;
  return {
    date: last.date,
    ctl: last.ctl,
    atl: last.atl,
    tsb: last.tsb,
    ramp_rate: rampRate,
  };
}

function numeric(v: unknown): number {
  return typeof v === "number" && Number.isFinite(v) ? v : 0;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

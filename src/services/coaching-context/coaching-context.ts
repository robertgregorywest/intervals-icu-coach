import type { IWellnessApi, WellnessRecord } from "../wellness/index.js";
import { isoToday } from "../../shared/clock.js";
import { shiftDate } from "../../shared/dates.js";
import type {
  AthleteAnchors,
  IAthleteAnchors,
} from "../athlete-anchors/index.js";
import type {
  AthleteSnapshot,
  CoachingContext,
  FitnessSnapshot,
  WellnessTrendPoint,
} from "./types.js";
import { round } from "../../shared/round.js";

export interface CoachingContextDeps {
  anchors: IAthleteAnchors;
  wellnessApi: IWellnessApi;
}

export interface CoachingContextOptions {
  days?: number;
  today?: string;
}

export const DEFAULT_DAYS = 7;
export const MAX_DAYS = 30;

export interface ICoachingContext {
  getCoachingContext(opts?: CoachingContextOptions): Promise<CoachingContext>;
}

/** Binds the context to its APIs and to "today", which a caller may override. */
export function createCoachingContext(
  deps: CoachingContextDeps & { today: () => string }
): ICoachingContext {
  return {
    getCoachingContext: (opts) =>
      buildCoachingContext(deps, {
        ...opts,
        today: opts?.today ?? deps.today(),
      }),
  };
}

export async function buildCoachingContext(
  deps: CoachingContextDeps,
  opts: CoachingContextOptions = {}
): Promise<CoachingContext> {
  const days = clampDays(opts.days);
  const today = opts.today ?? isoToday();
  const oldest = shiftDate(today, -(days - 1));

  // The athlete record and the MAP zones both come from the Athlete anchors
  // module, the one place they are read.
  const [anchors, wellnessRaw, { map, mapZones, mapWarning }] =
    await Promise.all([
      deps.anchors.getAthleteAnchors(),
      deps.wellnessApi.getWellness(oldest, today),
      deps.anchors.getMapAnchors({ today }),
    ]);

  const athlete = summarizeAthlete(anchors);
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

function summarizeAthlete(f: AthleteAnchors): AthleteSnapshot {
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
        ctl: round(ctl, 1),
        atl: round(atl, 1),
        tsb: round(ctl - atl, 1),
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
    trend.length > 1 ? round((last.ctl - first.ctl) / trend.length, 1) : 0;
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

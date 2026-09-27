import type { AthleteProfile } from "../athlete/index.js";
import type { WellnessRecord } from "../wellness/index.js";
import type { MapInfo } from "../map/index.js";
import type { ZoneRow } from "../athlete-anchors/index.js";

export interface AthleteSnapshot {
  id: string | null;
  name: string | null;
  weight: number | null;
  ftp: number | null;
  lthr: number | null;
  max_hr: number | null;
  resting_hr: number | null;
  // HR (bpm) and pace zone boundaries from Intervals.icu; `null` when not configured for cycling.
  // Power zones are intentionally omitted — the coaching view uses MAP zones (`mapZones`),
  // not FTP-anchored ones. The native FTP/Coggan zones remain available via `get_athlete`.
  hr_zones: number[] | null;
  pace_zones: number[] | null;
  sport_settings_count: number;
}

export interface FitnessSnapshot {
  date: string | null;
  ctl: number | null;
  atl: number | null;
  tsb: number | null;
  ramp_rate: number | null;
}

export interface WellnessTrendPoint {
  date: string;
  ctl: number;
  atl: number;
  tsb: number;
  fatigue: number | null;
  soreness: number | null;
  motivation: number | null;
  mood: number | null;
  stress: number | null;
  readiness: number | null;
  sleep_secs: number | null;
  sleep_score: number | null;
  resting_hr: number | null;
  hrv: number | null;
}

export interface CoachingContext {
  asOf: string;
  daysWindow: number;
  athlete: AthleteSnapshot;
  fitness: FitnessSnapshot;
  wellnessTrend: WellnessTrendPoint[];
  map: MapInfo | null;
  // MAP-anchored training zones (Ric Stern / cyclecoach model) — the canonical coaching zones.
  // `null` when MAP is unavailable (see mapWarning).
  mapZones: ZoneRow[] | null;
  mapWarning?: string;
}

export type RawAthlete = AthleteProfile;
export type RawWellness = WellnessRecord;

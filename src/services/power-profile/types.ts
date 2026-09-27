import type { ZoneRow } from "../athlete-anchors/index.js";

export type { ZoneRow };

export type Sex = "male" | "female";

export type AeroPosition = "road_hoods" | "road_drops" | "tt" | "upright";

export type Discipline =
  | "road_race"
  | "tt"
  | "crit"
  | "mtb"
  | "gravel"
  | "sportive"
  | "track"
  | "triathlon";

export type TrainingHistory = "new" | "intermediate" | "experienced";

export type StrengthFrequency = "none" | "once" | "twice" | "three_plus";

export type InputSource =
  | "override"
  | "athlete"
  | "powerCurve"
  | "mapDerivation"
  | "derived"
  | "missing";

export interface InputField<T> {
  value: T | null;
  source: InputSource;
  note?: string;
}

export interface PowerProfileOverrides {
  mapWatts?: number;
  weightKg?: number;
  ftpWatts?: number;
  sex?: Sex;
  age?: number;
  heightCm?: number;
  p5s?: number;
  p60?: number;
  p5min?: number;
  aeroPosition?: AeroPosition;
  cdaKnown?: number;
  discipline?: Discipline;
  history?: TrainingHistory;
  strength?: StrengthFrequency;
  weeklyHours?: number;
  masters?: boolean;
  powerCurveRange?: string;
}

export interface ResolvedInputs {
  mapWatts: InputField<number>;
  weightKg: InputField<number>;
  ftpWatts: InputField<number>;
  sex: InputField<Sex>;
  age: InputField<number>;
  heightCm: InputField<number>;
  p5s: InputField<number>;
  p60: InputField<number>;
  p5min: InputField<number>;
  aeroPosition: InputField<AeroPosition>;
  cdaKnown: InputField<number>;
  discipline: InputField<Discipline>;
  history: InputField<TrainingHistory>;
  strength: InputField<StrengthFrequency>;
  weeklyHours: InputField<number>;
  masters: InputField<boolean>;
  warnings: string[];
}

export type FtpStatus = "low" | "typical" | "high" | "missing";

export interface FtpCheck {
  mapWatts: number;
  enteredFtp: number | null;
  estFtpRange: [number, number];
  ratioPct: number | null;
  status: FtpStatus;
  summary: string;
}

export interface PstsResult {
  cda: number;
  cdaMethod: "known" | "estimated";
  frontalAreaM2: number | null;
  cdFactor: number | null;
  mapPsts: number | null;
  ftpPsts: number | null;
  ftpUsedForPsts: number;
  summary: string;
}

export type CompoundBand = "modest" | "solid" | "strong" | "exceptional";

export interface CompoundResult {
  score: number;
  band: CompoundBand;
  pctU23: number;
  pctMasters: number;
  summary: string;
}

export interface Vo2Result {
  ml_kg_min: number;
  baseCategory: string | null;
  ageAdjusted: { value: number; category: string | null } | null;
  isMastersByAge: boolean;
  summary: string;
}

export interface AllometricResult {
  wkg067: number;
  threshold: number;
  pctOfThreshold: number;
  summary: string;
}

export interface TpProfileRow {
  duration: "5s" | "1min" | "5min" | "FTP";
  wkg: number;
  category: string | null;
}

export interface RiderTypeResult {
  shape: "down-sloping" | "up-sloping" | "horizontal" | "mixed";
  label: string;
  summary: string;
}

export interface MapBandResult {
  wkg: number;
  band: string;
}

export interface TtEstimateRow {
  distance: string;
  lowW: number;
  highW: number;
  lowPct: number;
  highPct: number;
}

export interface RaceEstimateRow {
  event: "road_race" | "crit";
  label: string;
  lowW: number;
  highW: number;
  wkg067Low: number;
  wkg067High: number;
}

export interface PowerProfileResult {
  inputs: ResolvedInputs;
  zones: ZoneRow[];
  ftpCheck: FtpCheck;
  psts: PstsResult | null;
  compound: CompoundResult | null;
  vo2max: Vo2Result | null;
  allometricMap: AllometricResult | null;
  tpProfile: TpProfileRow[] | null;
  riderType: RiderTypeResult | null;
  mapBand: MapBandResult | null;
  ttEstimates: TtEstimateRow[];
  raceEstimates: RaceEstimateRow[] | null;
  source: {
    attribution: string;
    formulasFrom: string;
  };
}

export type EventCategory =
  | "WORKOUT"
  | "NOTE"
  | "RACE_A"
  | "RACE_B"
  | "RACE_C"
  | "HOLIDAY"
  | "SICK"
  | "INJURED";

/** Every sport a workout or proposed session may carry — the schemas' enum. */
export const SPORT_TYPES = [
  "Ride",
  "Run",
  "Swim",
  "VirtualRide",
  "MountainBikeRide",
  "GravelRide",
  "TrailRun",
  "WeightTraining",
  "Yoga",
  "Hike",
  "OpenWaterSwim",
] as const;

export type SportType = (typeof SPORT_TYPES)[number];

/**
 * A power target on a planned step. Intervals.icu emits either a point value
 * or a `start`/`end` band; `units` is `w` in practice but the field exists, so
 * percent targets are handled rather than assumed away.
 */
export interface PlannedPower {
  units?: string;
  value?: number;
  start?: number;
  end?: number;
  /**
   * The head-unit averaging window Intervals.icu carries through from a
   * `power=1s` token on the step line. Opaque to every consumer here.
   */
  target?: string;
}

export interface PlannedCadence {
  units?: string;
  value?: number;
  start?: number;
  end?: number;
}

/**
 * A step in `workout_doc` — Intervals.icu's own parse of the workout text, and
 * the same structure the head unit receives. Either a simple step or a repeat
 * block carrying `reps` over nested `steps`.
 */
export interface PlannedDocStep {
  text?: string;
  duration?: number;
  /** True when the step ramps between `power.start` and `power.end`. */
  ramp?: boolean;
  distance?: number;
  power?: PlannedPower;
  cadence?: PlannedCadence;
  reps?: number;
  steps?: PlannedDocStep[];
  /** Set on the steps under a `Warmup` or `Cooldown` section header. */
  warmup?: true;
  cooldown?: true;
}

export interface WorkoutDoc {
  steps?: PlannedDocStep[];
  duration?: number;
  distance?: number;
  [key: string]: unknown;
}

export interface IntervalsEvent {
  id?: number;
  uid?: string;
  category: EventCategory;
  start_date_local: string;
  type: SportType;
  name: string;
  description: string;
  external_id?: string;
  color?: string;
  /** Intervals.icu's structured parse of `description`. Absent on notes. */
  workout_doc?: WorkoutDoc;
  /** Planned training load. */
  icu_training_load?: number;
  /** FTP the event was planned against; often null. */
  icu_ftp?: number | null;
  moving_time?: number;
}

export interface ClientConfig {
  apiKey: string;
  athleteId: string;
  baseUrl: string;
}

export interface RequestOptions {
  method?: string;
  body?: unknown;
  headers?: Record<string, string>;
  /**
   * `binary` returns the raw bytes as a `Uint8Array` instead of parsing the
   * body. Needed for the original-upload endpoint, which serves FIT files.
   */
  responseType?: "json" | "binary";
}

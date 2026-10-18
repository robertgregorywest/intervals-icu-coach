export interface Activity {
  id: string;
  start_date_local: string;
  type: string;
  name: string;
  moving_time: number;
  elapsed_time: number;
  distance: number;
  total_elevation_gain: number;
  icu_ftp: number;
  icu_weighted_avg_watts: number;
  icu_average_watts: number;
  average_heartrate: number;
  max_heartrate: number;
  icu_intensity: number;
  icu_training_load: number;
  icu_variability_index: number;
  icu_efficiency_factor: number;
  average_cadence: number;
  max_watts: number;
  icu_intervals: ActivityInterval[];
  /** The planned event this activity was matched to, when one exists. */
  paired_event_id?: number | null;
  /** Intervals.icu's own scalar compliance figure (percent) for a paired activity. */
  compliance?: number | null;
  /** Set on indoor rides; absent (not `false`) on most outdoor ones. */
  trainer?: boolean | null;
  /** Mean temperature from the head unit's own sensor, °C. */
  average_temp?: number | null;
  /** The submaximal fatigue test Intervals.icu detected in this ride, if any. */
  submax_fatigue_test?: SubmaxFatigueTest | null;
  [key: string]: unknown;
}

/**
 * A submaximal fatigue test as the activity list carries it. Only the fields
 * read here are typed. Unset fields come back 0, not null: `hrrc` with
 * `end_index_hrrc` 0 (Intervals.icu saw too little HR drop to measure — the
 * athlete kept riding), and `rpe` / `tte_mins` until the athlete logs them in
 * the test's dialog.
 */
export interface SubmaxFatigueTest {
  /** `POWER` or `PACE` — the sport's "Detect Using" setting. */
  type: string;
  start_index: number;
  end_index: number;
  end_index_hrrc: number;
  duration: number;
  average_watts: number;
  cv: number;
  /** Mean HR over the test's last minute, not its last sample. */
  final_bpm: number;
  hrrc: number;
  /** Watts on a `POWER` test, m/s on a `PACE` one. */
  target: number;
  /** Intervals.icu's 1–10 scale, logged after the test; 0 when unlogged. */
  rpe: number;
  /** Minutes longer the athlete reckons the target could have been held; 0 when unlogged. */
  tte_mins: number;
  /** `average_watts / final_bpm` — not the ride-level `icu_efficiency_factor`. */
  efficiency_factor: number;
  ignore: boolean;
  [key: string]: unknown;
}

export interface ActivityInterval {
  id: number;
  type: string;
  label: string;
  group_id: string | null;
  start_index: number;
  end_index: number;
  start_time: number;
  elapsed_time: number;
  distance: number;
  average_watts: number;
  max_watts: number;
  average_heartrate: number;
  max_heartrate: number;
  average_cadence: number;
  [key: string]: unknown;
}

/** What `GET`/`PUT /api/v1/activity/{id}/intervals` returns. */
export interface ActivityIntervalsDoc {
  id: string;
  analyzed?: string;
  icu_intervals: ActivityInterval[];
  /** Intervals.icu's own grouping of similar intervals. Derived; never sent. */
  icu_groups?: unknown[];
  [key: string]: unknown;
}

/**
 * One interval as it is *written*, which is a far smaller thing than one as it
 * is read back.
 *
 * Intervals.icu recomputes every metric from the boundaries — power, cadence,
 * heart rate, distance, duration, training load, zone, even weather — so
 * sending any of them is at best noise and at worst a figure that looks
 * authoritative in the request and is silently discarded. Only `start_index`,
 * `end_index` and `label` survive the round trip.
 *
 * `type` is sent for shape and is **not honoured**: an interval sent as
 * `RECOVERY` comes back `WORK`. It is kept here so its absence is never
 * mistaken for an oversight.
 *
 * Boundaries are stream sample indices, end-exclusive: `end_index -
 * start_index` is the interval's sample count, which equals its seconds only
 * on a 1 Hz recording.
 */
export interface IntervalWrite {
  type: "WORK" | "RECOVERY";
  start_index: number;
  end_index: number;
  label: string;
}

export interface ActivityStreams {
  /** Nulls where the recording dropped power — a gap, not a zero. */
  watts?: Array<number | null>;
  heartrate?: number[];
  cadence?: number[];
  time?: number[];
  velocity_smooth?: number[];
  altitude?: number[];
  latlng?: number[][];
  [key: string]: unknown;
}

/**
 * A track session is timed twice over: a helper's lap timer records what
 * happened, and — sometimes — an SRM records what it cost. `alignment/`
 * owns the join between the two. This module owns the half that survives on its
 * own.
 *
 * A lap time is a measurement. It does not move when MAP moves, when air
 * density moves, or when the aero model is revised, which is what makes it the
 * right thing to keep. So a record stores the timed splits and the basis needed
 * to read them, and **nothing derived** — every speed, cadence, segment and
 * decline below is computed on read.
 */

import type { RunSplits } from "../alignment/types.js";

/** How a run began. Decides which laps are aggregated. */
export type RunStart = "gate" | "standing" | "flying";

/** Was this a race or a training session? */
export type SessionKind = "race" | "training";

/**
 * Everything needed to read a session's splits, as its frontmatter gives it.
 *
 * `gear` and `rolloutMm` yield the drivetrain's development. That is a *known*
 * quantity — distinct from the *fitted* development `alignment/`
 * recovers, which is distance ridden per revolution and equals this one only if
 * the rider covered exactly `lapDistanceMeters` per lap. The two disagreeing is
 * a finding (`docs/personal/track-context.md` §1 records ~0.4% on two gears),
 * so they are deliberately kept apart.
 */
export interface SessionBasis {
  /** Filename stem; the session's stable identity. */
  id: string;
  /** ISO date, `YYYY-MM-DD`. */
  date: string;
  kind: SessionKind;
  /** Free text: "2 km IP", "team session". */
  event?: string;
  venue?: string;
  /** Drivetrain ratio as `chainring x cog`, e.g. `64x16`. Never gear inches. */
  gear?: string;
  /** Tyre rollout in millimetres. Defaults to 2099 — a 700×23 track tyre. */
  rolloutMm: number;
  /**
   * Metres per crank revolution, supplied directly. Overrides `gear` ×
   * `rolloutMm`, for a session where the development is known but the gear is
   * not.
   */
  developmentMeters?: number;
  crankLengthMm?: number;
  /** "race" / "training" / "skinsuit" — free text, an aero note for a reader. */
  suit?: string;
  lapDistanceMeters: number;
  /** Present when the session was also recorded to Intervals.icu. */
  activityId?: string;
  /** Where the splits came from: "timing export", "helper's phone". */
  source?: string;
  /** Default start type; per-run overrides come from `start.<run>` keys. */
  start: RunStart;
  /** Per-run start overrides, keyed by the run label the export gives. */
  runStarts: Record<string, RunStart>;
}

/** A record file as read from disk: the basis, the prose, and the export. */
export interface TrackSessionRecord {
  basis: SessionBasis;
  /** Body prose above the splits block, verbatim. */
  prose: string;
  /** Runs exactly as `parseLapSplits` returns them. */
  runs: RunSplits[];
  /** Path relative to the records directory, for error messages. */
  file: string;
}

/** One timed lap, with what the lap time alone implies. */
export interface DerivedLap {
  /** Position within the run, 1-based — the number a reader counts in. */
  lap: number;
  lapTimeSeconds: number;
  cumulativeTimeSeconds: number;
  /** `lapDistance / lapTime`. Model-free. */
  speedMetersPerSecond: number;
  /** `speed × 60 / development`. Exact given the gear. */
  cadenceRpm?: number;
  /** True for the standing or gate lap, which no aggregate includes. */
  standingStart: boolean;
}

/** A contiguous stretch of the flying portion — its opening or its close. */
export interface SegmentSummary {
  /** 1-based lap numbers, inclusive. */
  fromLap: number;
  toLap: number;
  timeSeconds: number;
  meanSpeedMetersPerSecond: number;
}

/**
 * What perfectly even pacing would have been worth.
 *
 * Aero work over a fixed distance scales with Σv², so the flat-equivalent speed
 * is the RMS of the lap speeds, not their mean. `gainSeconds` is the difference
 * between the time ridden and the time the same total squared speed would have
 * produced ridden flat — and it is reliably small, which is itself the finding
 * (`track-context.md` §5: 0.08–0.15 s across two races).
 */
export interface PacingSummary {
  sumSquaredSpeed: number;
  rmsSpeedMetersPerSecond: number;
  flatEquivalentTimeSeconds: number;
  gainSeconds: number;
}

/** Aggregates over a run's flying portion. */
export interface RunSummary {
  /** Every lap, standing lap included. */
  totalTimeSeconds: number;
  totalDistanceMeters: number;
  /** The laps every aggregate below is taken over. */
  flyingLaps: number;
  flyingTimeSeconds: number;
  flyingDistanceMeters: number;
  /** Absent, with `flyingWithheld` saying why, when there are no flying laps. */
  meanLapTimeSeconds?: number;
  meanSpeedMetersPerSecond?: number;
  /** Sample SD (n − 1) of the flying lap times — how evenly it was ridden. */
  lapTimeSdSeconds?: number;
  opening?: SegmentSummary;
  closing?: SegmentSummary;
  /**
   * `(v_close / v_open)³ − 1`. Speed cubed is a power ratio over a fixed
   * distance, so this is the proportional power change from the opening
   * segment to the close, carrying no aero constant — only the exponent.
   *
   * Absent when the flying portion is two laps or fewer — too short to form
   * two segments that do not overlap.
   */
  declineRatio?: number;
  /** Present when the segments were formed; says why when they were not. */
  segmentsWithheld?: string;
  /**
   * Present when the run has no flying laps, so every flying aggregate (mean,
   * SD, segments, decline, pacing) is absent rather than computed over nothing.
   */
  flyingWithheld?: string;
  pacing?: PacingSummary;
}

/** One run of a session, derived. */
export interface DerivedRun {
  /** `<sessionId>#<run>` — the address a comparison takes. */
  ref: string;
  /** The run label, verbatim from the export. */
  run: string;
  start: RunStart;
  laps: DerivedLap[];
  summary: RunSummary;
}

/** A session as `get_track_session` returns it. */
export interface TrackSessionDetail {
  basis: SessionBasis;
  /** Metres per crank revolution actually used, and where it came from. */
  developmentMeters?: number;
  developmentSource?: "gear" | "supplied";
  prose: string;
  runs: DerivedRun[];
  notes?: string[];
}

/** One row of `list_track_sessions`. */
export interface TrackSessionListing {
  id: string;
  date: string;
  kind: SessionKind;
  event?: string;
  venue?: string;
  activityId?: string;
  runs: Array<{
    ref: string;
    run: string;
    start: RunStart;
    laps: number;
    distanceMeters: number;
    durationSeconds: number;
  }>;
}

export interface ListTrackSessionsResult {
  /** The directory searched, always reported — it is often absent. */
  directory: string;
  sessions: TrackSessionListing[];
  notes?: string[];
}

/** One lap position across every compared run. */
export interface ComparisonLapRow {
  lap: number;
  standingStart: boolean;
  /**
   * Lap time per run, in the order the refs were given; `null` where a run
   * has no lap at this position. `null`, not `undefined`: JSON writes an
   * array hole as `null`, so that is what a caller receives either way.
   */
  values: Array<number | null>;
  /** Difference against the first ref. `null` in the first column. */
  deltas: Array<number | null>;
}

/** One summary row — total, flying, a segment, or the decline. */
export interface ComparisonSummaryRow {
  label: string;
  values: Array<number | null>;
  deltas: Array<number | null>;
  /** `seconds` or `ratio` — the decline is not a time. */
  unit: "seconds" | "ratio";
}

export interface RunComparison {
  /** The runs compared, in the order given. The first is the baseline. */
  refs: string[];
  columns: Array<{
    ref: string;
    date: string;
    event?: string;
    gear?: string;
    start: RunStart;
  }>;
  laps: ComparisonLapRow[];
  summary: ComparisonSummaryRow[];
  notes?: string[];
}

export interface GetTrackSessionOptions {
  id: string;
  /** Laps per segment. Defaults to the widest non-overlapping pair, max 3. */
  segmentLaps?: number;
}

export interface CompareTrackSessionsOptions {
  /** `<sessionId>` or `<sessionId>#<run>`. The first is the baseline. */
  runs: string[];
  segmentLaps?: number;
}

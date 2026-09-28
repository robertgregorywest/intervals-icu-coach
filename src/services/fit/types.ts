/** One lap as the recording device wrote it. */
export interface FitLap {
  /** Position in the file, 0-based. */
  index: number;
  /** Seconds from the first lap's start. */
  startTimeSeconds: number;
  /** `total_elapsed_time` — wall-clock, matching how Intervals.icu reports laps. */
  durationSeconds: number;
  /** `total_timer_time` — excludes paused time. */
  timerSeconds?: number;
  /** `total_distance`, metres. */
  distanceMeters?: number;
  averageWatts?: number;
  normalizedWatts?: number;
  maxWatts?: number;
  averageHeartrate?: number;
  averageCadence?: number;
}

/** One `record` message, scaled to SI units. */
export interface FitRecord {
  /** Seconds since the FIT epoch; `null` when the message carries none. */
  timestamp: number | null;
  /** Whole rpm — FIT's `cadence` is a `uint8`. */
  cadence: number | null;
  /** m/s: `speed`, or `enhanced_speed` when only that was written. */
  speed: number | null;
  /** Cumulative metres. */
  distance: number | null;
}

/** What one `record` message is given. */
export interface RecordSpeed {
  /** m/s; `null` writes the invalid sentinel — no claim for this sample. */
  speed: number | null;
  /** Cumulative metres at this sample. */
  distance: number | null;
}

/**
 * Reads and rewrites FIT files — the original uploads Intervals.icu keeps.
 * Pure: bytes in, values or bytes out.
 */
export interface IFitCodec {
  /**
   * The `lap` messages the recording device wrote. Never throws: `null` when
   * the bytes are not a FIT file or cannot be walked, `[]` when the file is
   * valid but carries no laps.
   */
  decodeLaps(bytes: Uint8Array): FitLap[] | null;
  /**
   * Every `record` message in file order. Throws `FitFormatError` when the
   * file cannot be walked.
   */
  readRecords(bytes: Uint8Array): FitRecord[];
  /**
   * A copy of `bytes` with `speeds[i]` written into the i-th `record` message,
   * and lap and session totals recomputed to match. Throws `FitFormatError`
   * when the file cannot be walked, is a chained FIT file, or `speeds` does
   * not have one entry per record.
   */
  rewriteSpeed(bytes: Uint8Array, speeds: RecordSpeed[]): Uint8Array;
}

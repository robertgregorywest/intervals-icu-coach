/**
 * Minimal FIT decoder that reads `lap` messages and nothing else.
 *
 * Why this exists: `icu_intervals` is Intervals.icu's *interval analysis* — a
 * derived, editable segmentation that usually tracks the device's laps but is
 * free to diverge from them. When it diverges, a planned-vs-actual review is
 * silently wrong about which reps were delivered (see
 * `docs/adr/0006-device-laps-as-the-execution-record.md`). The laps the head
 * unit wrote are the only faithful record of what the athlete actually marked,
 * and the original upload is the only place the API exposes them.
 *
 * Deliberately partial: it reads global message 19 and nothing else, walking
 * the stream with `format.ts`. It never throws — a file it cannot make sense of
 * yields `null`, and the caller falls back to the derived intervals rather than
 * losing the review entirely.
 */

import { readFields, walkFit } from "./format.js";
import type { FitLap } from "./types.js";
import { round } from "../../round.js";

const LAP_GLOBAL_MESSAGE = 19;

// Lap field numbers from the FIT global profile.
const FIELD_START_TIME = 2;
const FIELD_TOTAL_ELAPSED_TIME = 7;
const FIELD_TOTAL_TIMER_TIME = 8;
const FIELD_TOTAL_DISTANCE = 9;
const FIELD_AVG_HEART_RATE = 15;
const FIELD_AVG_CADENCE = 17;
const FIELD_AVG_POWER = 19;
const FIELD_MAX_POWER = 20;
const FIELD_NORMALIZED_POWER = 33;

/**
 * Decode the `lap` messages from a raw FIT file.
 *
 * Returns `null` when the bytes are not a FIT file or the record stream cannot
 * be walked, and an empty array when the file is valid but carries no laps.
 */
export function decodeFitLaps(bytes: Uint8Array): FitLap[] | null {
  try {
    const { messages } = walkFit(bytes);
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const raw = messages
      .filter(
        (m) =>
          m.kind === "data" &&
          m.definition.globalMessageNumber === LAP_GLOBAL_MESSAGE
      )
      .map((m) => readFields(view, m));
    return toLaps(raw);
  } catch {
    return null;
  }
}

/**
 * Turn raw field maps into laps, anchored so `startTimeSeconds` is measured
 * from the first lap rather than from the FIT epoch.
 */
function toLaps(raw: Array<Map<number, number>>): FitLap[] {
  const withDuration = raw.filter((m) => {
    const elapsed = m.get(FIELD_TOTAL_ELAPSED_TIME);
    return elapsed !== undefined && elapsed > 0;
  });
  if (withDuration.length === 0) return [];

  const anchor = withDuration[0].get(FIELD_START_TIME);

  return withDuration.map((m, index) => {
    const start = m.get(FIELD_START_TIME);
    const lap: FitLap = {
      index,
      startTimeSeconds:
        start !== undefined && anchor !== undefined ? start - anchor : 0,
      durationSeconds: round(m.get(FIELD_TOTAL_ELAPSED_TIME)! / 1000, 0),
    };

    const timer = m.get(FIELD_TOTAL_TIMER_TIME);
    if (timer !== undefined) lap.timerSeconds = round(timer / 1000, 0);

    const distance = m.get(FIELD_TOTAL_DISTANCE);
    if (distance !== undefined) lap.distanceMeters = distance / 100;

    const np = m.get(FIELD_NORMALIZED_POWER);
    if (np !== undefined) lap.normalizedWatts = np;

    const avgPower = m.get(FIELD_AVG_POWER);
    if (avgPower !== undefined) lap.averageWatts = avgPower;

    const maxPower = m.get(FIELD_MAX_POWER);
    if (maxPower !== undefined) lap.maxWatts = maxPower;

    const hr = m.get(FIELD_AVG_HEART_RATE);
    if (hr !== undefined) lap.averageHeartrate = hr;

    const cadence = m.get(FIELD_AVG_CADENCE);
    if (cadence !== undefined) lap.averageCadence = cadence;

    return lap;
  });
}

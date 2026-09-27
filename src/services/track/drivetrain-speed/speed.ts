/**
 * **Drivetrain speed**: wheel speed from recorded cadence through a fixed gear.
 *
 * On a track bike the cranks cannot turn without the wheel, so
 * `speed = development × cadence / 60` is a measurement, not a model — given
 * the true development (ratio × rollout), never the fitted one, so distance is
 * what the wheel travelled rather than what the assumed line measures
 * (`docs/personal/track-context.md` §1).
 *
 * Each sample's speed holds until the next sample, the same convention the
 * alignment reads streams by (`alignment/samples.ts`), so a lap window placed by
 * the alignment integrates this stream exactly as it averaged the cadence. A
 * gap longer than `PAUSE_FACTOR` sampling intervals is a pause in the
 * recording: the sample before it holds for one interval and the rest of the
 * gap adds no distance.
 *
 * Cadence 0 is no reading, not a stop. The power meter reports cadence 0 (with
 * power 0) whenever the rider is not driving the pedals, even though a fixed
 * gear keeps the legs turning: on 2026-07-12 that includes a 50 s roll-down
 * from 12 m/s. A genuine stop reads the same, so no speed is claimed for either,
 * and neither adds distance.
 */

import type { FitRecord, RecordSpeed } from "../../fit/index.js";
import { medianSampleInterval } from "../alignment/samples.js";

/** A gap this many sampling intervals long is a pause, not a dropped sample. */
export const PAUSE_FACTOR = 3;

/** A stretch of the recording, in seconds from its first sample. */
export interface TimeRange {
  startSeconds: number;
  endSeconds: number;
}

export interface DrivetrainSpeedStream {
  /** Seconds from the first timestamped record — Intervals.icu's `time` stream. */
  times: number[];
  /** One per record, in file order. */
  values: RecordSpeed[];
  /** How long each sample's speed holds, seconds. */
  holds: number[];
  samplingIntervalSeconds: number;
  counts: {
    records: number;
    withSpeed: number;
    missingCadence: number;
    /** Cadence 0: rolling without torque, or stopped — no speed claimed. */
    zeroCadence: number;
    outsideOnTrack: number;
    pauses: number;
    pausedSeconds: number;
  };
}

export function computeDrivetrainSpeed(
  records: FitRecord[],
  developmentMeters: number,
  onTrack?: TimeRange[]
): DrivetrainSpeedStream {
  const first = records.find((r) => r.timestamp !== null)?.timestamp;
  if (first === undefined || first === null) {
    throw new Error("The recording carries no timestamps to integrate over.");
  }

  // A record without a timestamp takes its predecessor's, so it holds for zero.
  const times: number[] = [];
  let last = 0;
  for (const r of records) {
    if (r.timestamp !== null) last = r.timestamp - first;
    times.push(last);
  }
  const interval = medianSampleInterval(times) ?? 1;

  const counts = {
    records: records.length,
    withSpeed: 0,
    missingCadence: 0,
    zeroCadence: 0,
    outsideOnTrack: 0,
    pauses: 0,
    pausedSeconds: 0,
  };

  const holds = times.map((t, i) => {
    if (i + 1 >= times.length) return interval;
    const gap = times[i + 1] - t;
    if (gap > PAUSE_FACTOR * interval) {
      counts.pauses += 1;
      counts.pausedSeconds += gap - interval;
      return interval;
    }
    return gap;
  });

  const inRange = (t: number) =>
    !onTrack || onTrack.some((r) => t >= r.startSeconds && t < r.endSeconds);

  const values: RecordSpeed[] = [];
  let distance = 0;
  records.forEach((r, i) => {
    let speed: number | null = null;
    if (!inRange(times[i])) counts.outsideOnTrack += 1;
    else if (r.cadence === null) counts.missingCadence += 1;
    else if (r.cadence === 0) counts.zeroCadence += 1;
    else {
      speed = (developmentMeters * r.cadence) / 60;
      counts.withSpeed += 1;
    }
    // Distance at a sample is what the wheel covered before it.
    values.push({ speed, distance });
    if (speed !== null) distance += speed * holds[i];
  });

  return { times, values, holds, samplingIntervalSeconds: interval, counts };
}

/** Metres the stream covers over `[start, end)`, seconds from the first sample. */
export function distanceOver(
  stream: DrivetrainSpeedStream,
  start: number,
  end: number
): number {
  let metres = 0;
  stream.values.forEach(({ speed }, i) => {
    if (speed === null) return;
    const from = stream.times[i];
    const to = from + stream.holds[i];
    const overlap = Math.min(to, end) - Math.max(from, start);
    if (overlap > 0) metres += speed * overlap;
  });
  return metres;
}

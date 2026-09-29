/**
 * Judging **Drivetrain speed**: against the splits, which are the reference,
 * and against the sensor it replaced, which is only a cross-check.
 */

import type { FitRecord } from "../../fit/index.js";
import type { TrackLapAlignmentResult } from "../alignment/types.js";
import { round } from "../../../round.js";
import { RATE_DP } from "../records/precision.js";
import { distanceOver, type DrivetrainSpeedStream } from "./speed.js";
import type {
  PercentSpread,
  RunDistanceCheck,
  SensorComparison,
  SplitsComparison,
} from "./types.js";

const PERCENT_DP = 3;
/** Below this cadence the rider is freewheeling to a stop or stood still. */
const PEDALLING_RPM = 30;

const percent = (value: number, reference: number) =>
  round((value / reference - 1) * 100, PERCENT_DP);

/** The same stream, carrying the recording's own sensor speed instead. */
export function sensorStream(
  stream: DrivetrainSpeedStream,
  records: FitRecord[]
): DrivetrainSpeedStream | undefined {
  if (!records.some((r) => r.speed !== null && r.speed > 0)) return undefined;
  return {
    ...stream,
    values: records.map((r) => ({ speed: r.speed, distance: r.distance })),
  };
}

export function compareWithSensor(
  stream: DrivetrainSpeedStream,
  sensor: DrivetrainSpeedStream,
  records: FitRecord[]
): SensorComparison | undefined {
  const differences: number[] = [];
  const implied: number[] = [];
  records.forEach((r, i) => {
    const ours = stream.values[i].speed;
    if (r.speed === null || r.speed <= 0 || ours === null) return;
    if (r.cadence === null || r.cadence < PEDALLING_RPM) return;
    differences.push((ours / r.speed - 1) * 100);
    implied.push((r.speed * 60) / r.cadence);
  });
  if (differences.length === 0) return undefined;

  const end =
    stream.times[stream.times.length - 1] + stream.samplingIntervalSeconds;
  const sensorDistance = distanceOver(sensor, 0, end);
  const ourDistance = distanceOver(stream, 0, end);
  return {
    samplesCompared: differences.length,
    speedDifferencePercent: spread(differences),
    sensorImpliedDevelopmentMeters: round(quantile(implied, 0.5), RATE_DP),
    sensorDistanceMeters: round(sensorDistance, 1),
    drivetrainDistanceMeters: round(ourDistance, 1),
    distanceDifferencePercent: percent(ourDistance, sensorDistance),
  };
}

export function compareWithSplits(
  sessionId: string,
  alignment: TrackLapAlignmentResult,
  stream: DrivetrainSpeedStream,
  sensor: DrivetrainSpeedStream | undefined
): SplitsComparison {
  const lap = alignment.lapDistanceMeters;
  let scored = 0;
  let ours = 0;
  let theirs = 0;

  const runs = alignment.runs.map((run): RunDistanceCheck => {
    const start = run.startOffsetSeconds;
    const end = start + run.durationSeconds;
    const drivetrain = distanceOver(stream, start, end);
    const sensorDistance = sensor
      ? distanceOver(sensor, start, end)
      : undefined;
    scored += run.distanceMeters;
    ours += drivetrain;
    if (sensorDistance !== undefined) theirs += sensorDistance;

    const check: RunDistanceCheck = {
      run: run.run,
      verdict: run.confidence.verdict,
      scoredDistanceMeters: run.distanceMeters,
      drivetrainDistanceMeters: round(drivetrain, 2),
      errorPercent: percent(drivetrain, run.distanceMeters),
      fittedDevelopmentMeters: run.fittedRolloutMeters,
    };
    if (sensorDistance !== undefined) {
      check.sensorDistanceMeters = round(sensorDistance, 2);
      check.sensorErrorPercent = percent(sensorDistance, run.distanceMeters);
    }
    if (run.laps) {
      check.laps = run.laps.map((l) => {
        const metres = distanceOver(stream, l.startSeconds, l.endSeconds);
        return {
          index: l.index,
          lapTimeSeconds: l.lapTimeSeconds,
          drivetrainDistanceMeters: round(metres, 2),
          errorPercent: percent(metres, lap),
          ...(sensor && {
            sensorErrorPercent: percent(
              distanceOver(sensor, l.startSeconds, l.endSeconds),
              lap
            ),
          }),
        };
      });
    }
    if (run.lapsWithheld) check.lapsWithheld = run.lapsWithheld;
    return check;
  });

  return {
    sessionId,
    lapDistanceMeters: lap,
    runs,
    errorPercent: scored > 0 ? percent(ours, scored) : 0,
    ...(sensor &&
      scored > 0 && { sensorErrorPercent: percent(theirs, scored) }),
  };
}

function spread(values: number[]): PercentSpread {
  return {
    median: round(quantile(values, 0.5), PERCENT_DP),
    p10: round(quantile(values, 0.1), PERCENT_DP),
    p90: round(quantile(values, 0.9), PERCENT_DP),
  };
}

function quantile(values: number[], q: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[
    Math.min(sorted.length - 1, Math.round(q * (sorted.length - 1)))
  ];
}

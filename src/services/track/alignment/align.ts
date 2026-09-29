/**
 * Joining the lap-timer record to the activity's streams.
 *
 * Every reading carries the band that alignment uncertainty puts around it. The
 * residual curve is flat near its minimum — ±1 s of offset moves it by 1–3% —
 * so quoting a residual in rpm alone would overstate how precisely the run is
 * placed. Re-reading each figure at both edges of the fitted offset interval
 * converts that flatness into the unit the caller reasons in. On the 2026-08-08
 * session it comes out at ±0.3–6 W on a run average but 21–38 W on a final lap,
 * where the interval slides the window into the post-line power collapse. That
 * fragility is real and currently invisible; the band is how it becomes visible.
 */

import type { IActivitiesApi } from "../../activities/index.js";
import {
  medianSampleInterval,
  normalizeTimes,
  windowMean,
  type TimedStream,
} from "./samples.js";
import { fitRun, THRESHOLDS, type RunFit } from "./fit.js";
import { DEFAULT_LAP_DISTANCE_METERS, parseLapSplits } from "./splits.js";
import {
  assignRunsToWindows,
  detectCandidateWindows,
  searchRange,
  WindowError,
} from "./windows.js";
import type {
  AlignedLap,
  AlignedRun,
  Reading,
  RolloutAgreement,
  RunSplits,
  TrackLapAlignmentResult,
  TrackLapPowerOptions,
} from "./types.js";
import { round } from "../../../shared/round.js";

/** Streams the join reads. Cadence is required; the rest are read if present. */
const STREAM_TYPES = ["time", "watts", "cadence", "heartrate"];

export class TrackAlignmentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TrackAlignmentError";
  }
}

export interface TrackLapAlignmentDeps {
  activitiesApi: IActivitiesApi;
}

export async function computeTrackLapPower(
  deps: TrackLapAlignmentDeps,
  options: TrackLapPowerOptions
): Promise<TrackLapAlignmentResult> {
  const lapDistanceMeters =
    options.lapDistanceMeters ?? DEFAULT_LAP_DISTANCE_METERS;
  const runs = parseLapSplits(options.splits, lapDistanceMeters);

  const streams = await deps.activitiesApi.getActivityStreams(
    options.activityId,
    STREAM_TYPES
  );

  const cadenceValues = streams.cadence;
  if (!cadenceValues?.length) {
    throw new TrackAlignmentError(
      `Activity ${options.activityId} carries no cadence stream. Cadence is the only ` +
        "channel a track recording carries that follows speed, so without it there is " +
        "nothing to align the lap splits against."
    );
  }

  const times = normalizeTimes(streams.time, cadenceValues.length);
  const cadence: TimedStream = { times, values: cadenceValues };
  const watts = streams.watts?.length
    ? { times, values: streams.watts }
    : undefined;
  const heartrate = streams.heartrate?.length
    ? { times, values: streams.heartrate }
    : undefined;

  const samplingIntervalSeconds = medianSampleInterval(times) ?? 1;
  const shortestLapSeconds = Math.min(
    ...runs.flatMap((run) => run.laps.map((lap) => lap.lapTimeSeconds))
  );
  const resolutionTooCoarse =
    samplingIntervalSeconds * THRESHOLDS.minSamplesPerLap > shortestLapSeconds;

  const shortestRunSeconds = Math.min(...runs.map((r) => r.durationSeconds));
  const windows = detectCandidateWindows(
    times,
    cadenceValues,
    shortestRunSeconds
  );
  if (windows.length === 0) {
    throw new TrackAlignmentError(
      `Activity ${options.activityId} has no stretch of sustained high cadence long ` +
        `enough to hold a ${shortestRunSeconds.toFixed(0)} s run. Check the activity is ` +
        "the track session the splits came from."
    );
  }

  const streamStart = times[0];
  const streamEnd = times[times.length - 1] + samplingIntervalSeconds;

  // Fit every run against every window once, then let the assignment choose.
  // Searching each run globally is what produced a 0.84 rpm residual and a
  // 10.25 m "rollout" from a stretch of easy riding, so the fit never sees an
  // offset outside a candidate window.
  const fits: Array<Array<RunFit | null>> = runs.map((run) =>
    windows.map((window) => {
      const range = searchRange(window, run, streamStart, streamEnd);
      if (!range) return null;
      return fitRun(cadence, run, range, lapDistanceMeters);
    })
  );

  const assignments = assignRunsToWindows(
    runs,
    windows,
    (runIndex, windowIndex) => {
      const fit = fits[runIndex][windowIndex];
      return fit ? fit.residualRpm : null;
    }
  );

  const aligned = assignments.map(({ run, window }) => {
    const runIndex = runs.indexOf(run);
    const windowIndex = windows.indexOf(window);
    const fit = fits[runIndex][windowIndex];
    if (!fit) {
      throw new WindowError(
        `Run ${run.run} lost its fit between assignment and readout.`
      );
    }
    return buildRun(run, fit, {
      watts,
      cadence,
      heartrate,
      resolutionTooCoarse,
      samplingIntervalSeconds,
    });
  });

  const notes: string[] = [];
  if (!watts) {
    notes.push(
      "The activity carries no power stream, so lap and run power are absent."
    );
  }
  if (resolutionTooCoarse) {
    notes.push(
      `Streams are sampled every ${samplingIntervalSeconds} s, which cannot resolve ` +
        `${shortestLapSeconds.toFixed(2)} s laps (at least ${THRESHOLDS.minSamplesPerLap} ` +
        "samples per lap are needed). Per-lap readings were withheld; run-level readings stand."
    );
  }

  return {
    activityId: options.activityId,
    lapDistanceMeters,
    samplingIntervalSeconds,
    runs: aligned,
    rolloutAgreement: rolloutAgreement(aligned),
    thresholds: THRESHOLDS,
    notes: notes.length ? notes : undefined,
  };
}

interface ReadoutContext {
  watts?: TimedStream;
  cadence: TimedStream;
  heartrate?: TimedStream;
  resolutionTooCoarse: boolean;
  samplingIntervalSeconds: number;
}

function buildRun(
  run: RunSplits,
  fit: RunFit,
  context: ReadoutContext
): AlignedRun {
  const [low, high] = fit.offsetIntervalSeconds;
  const offsets = [fit.offsetSeconds, low, high];

  const average = readingWithBand(
    context,
    offsets.map((offset) => ({
      start: offset,
      end: offset + run.durationSeconds,
    }))
  );

  const withheld = withholdReason(fit, context);
  const laps: AlignedLap[] | undefined = withheld
    ? undefined
    : run.laps.map((lap) => {
        const start =
          fit.offsetSeconds + lap.cumulativeTimeSeconds - lap.lapTimeSeconds;
        return {
          index: lap.index,
          lapTimeSeconds: lap.lapTimeSeconds,
          startSeconds: round(start, 2),
          endSeconds: round(fit.offsetSeconds + lap.cumulativeTimeSeconds, 2),
          reading: readingWithBand(
            context,
            offsets.map((offset) => ({
              start: offset + lap.cumulativeTimeSeconds - lap.lapTimeSeconds,
              end: offset + lap.cumulativeTimeSeconds,
            }))
          ),
        };
      });

  return {
    run: run.run,
    startOffsetSeconds: round(fit.offsetSeconds, 2),
    durationSeconds: run.durationSeconds,
    distanceMeters: run.distanceMeters,
    fittedRolloutMeters: round(fit.rolloutMeters, 4),
    confidence: {
      residualRpm: round(fit.residualRpm, 3),
      offsetIntervalSeconds: [round(low, 2), round(high, 2)],
      nextBestOffsetSeconds:
        fit.nextBestOffsetSeconds === undefined
          ? undefined
          : round(fit.nextBestOffsetSeconds, 2),
      nextBestResidualRpm:
        fit.nextBestResidualRpm === undefined
          ? undefined
          : round(fit.nextBestResidualRpm, 3),
      residualRatio:
        fit.residualRatio === undefined
          ? undefined
          : round(fit.residualRatio, 2),
      verdict: fit.verdict,
      reason: fit.reason,
      lapsFitted: fit.lapsFitted,
      lapsExcluded: fit.lapsExcluded,
    },
    average,
    laps,
    lapsWithheld: withheld,
  };
}

/**
 * Why per-lap output is not being returned, or `undefined` when it is.
 *
 * A run that is placed but not placed precisely still supports its own average
 * — the band on it says how well — but its lap boundaries do not mean anything,
 * and returning them would be exactly the plausible fiction this Tool exists to
 * avoid.
 */
function withholdReason(
  fit: RunFit,
  context: ReadoutContext
): string | undefined {
  if (context.resolutionTooCoarse) {
    return (
      `Streams are sampled every ${context.samplingIntervalSeconds} s, too coarse to ` +
      "resolve laps of this length."
    );
  }
  if (fit.verdict === "weak" || fit.verdict === "ambiguous") {
    return (
      `Alignment verdict is ${fit.verdict}: ${fit.reason ?? "the fit does not place lap boundaries."} ` +
      "Run-level readings stand; per-lap readings would not."
    );
  }
  return undefined;
}

/**
 * One reading per stream, plus the spread each takes across the supplied
 * windows. The first window is the fitted one and gives the value; the rest are
 * the interval edges and give the band.
 */
function readingWithBand(
  context: ReadoutContext,
  windows: Array<{ start: number; end: number }>
): Reading {
  const reading: Reading = {};
  const streams: Array<
    [TimedStream | undefined, "watts" | "cadence" | "heartrate"]
  > = [
    [context.watts, "watts"],
    [context.cadence, "cadence"],
    [context.heartrate, "heartrate"],
  ];

  for (const [stream, key] of streams) {
    if (!stream) continue;
    const values = windows
      .map((w) => windowMean(stream, w.start, w.end))
      .filter((v): v is number => v !== undefined);
    if (values.length === 0) continue;
    reading[key] = round(values[0], key === "watts" ? 0 : 1);
    const band = Math.max(...values) - Math.min(...values);
    reading[`${key}Band` as const] = round(band, key === "watts" ? 1 : 2);
  }

  return reading;
}

function rolloutAgreement(runs: AlignedRun[]): RolloutAgreement | undefined {
  const values = runs
    .filter((r) => r.confidence.verdict !== "weak")
    .map((r) => r.fittedRolloutMeters);
  if (values.length < 2) return undefined;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  return {
    minMeters: round(min, 4),
    maxMeters: round(max, 4),
    spreadPercent: round(((max - min) / mean) * 100, 2),
  };
}

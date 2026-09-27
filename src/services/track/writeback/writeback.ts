/**
 * Writing the fitted runs onto the activity.
 *
 * The alignment is reused whole and unchanged — this service adds no fitting.
 * What it adds is the translation into the platform's terms (sample indices, a
 * label, nothing else) and an account of what that translation cost.
 *
 * Two things are deliberately not done here. Metrics are never sent:
 * Intervals.icu recomputes every one of them from the boundaries, so a fitted
 * average power in the request would look authoritative, be silently discarded,
 * and mislead the next reader. And no run is dropped for its verdict: the
 * alignment holds run-level readings robust across the offset interval even
 * where per-lap ones are withheld, so a shaky fit is disclosed — in the label,
 * where it will actually be read — rather than hidden by omission.
 */

import type { IActivitiesApi, IntervalWrite } from "../../activities/index.js";
import type {
  AlignedRun,
  Reading,
  TrackLapAlignmentResult,
  TrackLapPowerOptions,
} from "../alignment/types.js";
import {
  medianSampleInterval,
  normalizeTimes,
  windowMean,
  type TimedStream,
} from "../alignment/samples.js";
import { snapRun } from "./snap.js";
import type {
  TrackRunWriteOptions,
  TrackRunWriteResult,
  WrittenRun,
} from "./types.js";

/** Streams the snapped re-read needs. Mirrors the alignment's own set. */
const STREAM_TYPES = ["time", "watts", "cadence", "heartrate"];

export interface TrackLapWritebackDeps {
  activitiesApi: IActivitiesApi;
  /** The fit `compute_track_lap_power` returns — the write reuses it whole. */
  align: (options: TrackLapPowerOptions) => Promise<TrackLapAlignmentResult>;
}

export async function writeTrackRuns(
  deps: TrackLapWritebackDeps,
  options: TrackRunWriteOptions
): Promise<TrackRunWriteResult> {
  // The alignment refuses first, and on its own terms — no cadence stream,
  // unparseable splits, splits that do not reconcile, no window that can hold a
  // run. Letting its error through untouched keeps the messages identical to
  // the read-only Tool's, and guarantees nothing is written on any of them.
  const aligned = await deps.align({
    activityId: options.activityId,
    splits: options.splits,
    lapDistanceMeters: options.lapDistanceMeters,
  });

  const preview = options.preview === true;
  const notes = [...(aligned.notes ?? [])];

  if (aligned.runs.length === 0) {
    notes.push(
      "The alignment placed no run, so nothing was written and the activity's " +
        "existing intervals are untouched."
    );
    return {
      activityId: aligned.activityId,
      mode: preview ? "preview" : "written",
      runs: [],
      intervalsReplaced: 0,
      notes,
    };
  }

  const streams = await deps.activitiesApi.getActivityStreams(
    options.activityId,
    STREAM_TYPES
  );
  const cadenceValues = streams.cadence ?? [];
  const times = normalizeTimes(streams.time, cadenceValues.length);
  const samplingIntervalSeconds =
    medianSampleInterval(times) ?? aligned.samplingIntervalSeconds;

  const readable: ReadContext = {
    watts: streams.watts?.length ? { times, values: streams.watts } : undefined,
    cadence: cadenceValues.length
      ? { times, values: cadenceValues }
      : undefined,
    heartrate: streams.heartrate?.length
      ? { times, values: streams.heartrate }
      : undefined,
  };

  const runs = aligned.runs.map((run) =>
    buildWrittenRun(run, times, samplingIntervalSeconds, readable)
  );

  notes.push(
    "Every stretch of the activity not covered by a written run is filled by " +
      "Intervals.icu's own intervals, so the activity carries more intervals " +
      "than runs were written."
  );
  if (runs.some((r) => r.verdict !== "strong")) {
    notes.push(
      "A run whose fit is not strong carries that verdict in its label. The " +
        "label is overwritten by the next write, so re-running after an " +
        "improved fit clears it — editing it by hand in the Intervals.icu UI " +
        "does not survive."
    );
  }

  if (preview) {
    return {
      activityId: aligned.activityId,
      mode: "preview",
      runs,
      intervalsReplaced: (await countExistingIntervals(deps, options)) ?? 0,
      notes,
    };
  }

  const existing = await deps.activitiesApi.getActivityIntervals(
    options.activityId
  );
  const written = await deps.activitiesApi.replaceActivityIntervals(
    options.activityId,
    runs.map(toIntervalWrite)
  );

  return {
    activityId: aligned.activityId,
    mode: "written",
    runs,
    intervalsReplaced: existing.icu_intervals?.length ?? 0,
    intervalsAfterWrite: written.icu_intervals?.length,
    notes,
  };
}

interface ReadContext {
  watts?: TimedStream;
  cadence?: TimedStream;
  heartrate?: TimedStream;
}

function buildWrittenRun(
  run: AlignedRun,
  times: number[],
  samplingIntervalSeconds: number,
  context: ReadContext
): WrittenRun {
  const fittedStart = run.startOffsetSeconds;
  const fittedEnd = run.startOffsetSeconds + run.durationSeconds;
  const snapped = snapRun(
    times,
    fittedStart,
    fittedEnd,
    samplingIntervalSeconds
  );

  return {
    run: run.run,
    label: composeLabel(run),
    verdict: run.confidence.verdict,
    reason: run.confidence.reason,
    startIndex: snapped.start.index,
    endIndex: snapped.end.index,
    fittedStartSeconds: round(fittedStart, 2),
    fittedEndSeconds: round(fittedEnd, 2),
    startDriftSeconds: snapped.start.driftSeconds,
    endDriftSeconds: snapped.end.driftSeconds,
    // The alignment's own figure, carried across so the two can be compared
    // without re-running it.
    fittedReading: run.average,
    snappedReading: readWindow(
      context,
      snapped.start.seconds,
      snapped.end.seconds
    ),
  };
}

/**
 * What the athlete sees on the chart.
 *
 * The run identifier is verbatim from the export, because that is what they
 * will look for. The verdict rides along whenever it is not `strong`: the label
 * is the only field the platform preserves, so a weak placement written with a
 * bare label would sit on the chart looking exactly as confident as a strong
 * one, with the caveat living only in a tool response nobody re-reads.
 */
export function composeLabel(run: AlignedRun): string {
  const name = /^run\b/i.test(run.run.trim())
    ? run.run.trim()
    : `Run ${run.run.trim()}`;
  return run.confidence.verdict === "strong"
    ? name
    : `${name} (${run.confidence.verdict} fit)`;
}

function toIntervalWrite(run: WrittenRun): IntervalWrite {
  // `type` is sent for shape only — Intervals.icu derives it and returns WORK
  // whatever is sent. Metrics are deliberately absent; see the module comment.
  return {
    type: "WORK",
    start_index: run.startIndex,
    end_index: run.endIndex,
    label: run.label,
  };
}

/** The reading the activity will show, over the snapped window. */
function readWindow(context: ReadContext, start: number, end: number): Reading {
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
    const value = windowMean(stream, start, end);
    if (value === undefined) continue;
    // Presented the way the platform presents it, because this field's whole
    // job is to say what the activity will show. Verified against a live write
    // on 2026-08-13: Intervals.icu truncates power and heart rate to whole
    // units (a 375.83 W window displays as 375, not 376) and leaves cadence
    // fractional. Rounding here instead would put a figure in the response that
    // the UI never shows, which is the confusion this field exists to prevent.
    reading[key] = key === "cadence" ? round(value, 1) : Math.trunc(value);
  }

  return reading;
}

/**
 * What a preview would replace. Best-effort: a preview that cannot read the
 * current intervals is still a useful preview, and must not fail for it.
 */
async function countExistingIntervals(
  deps: TrackLapWritebackDeps,
  options: TrackRunWriteOptions
): Promise<number | undefined> {
  try {
    const doc = await deps.activitiesApi.getActivityIntervals(
      options.activityId
    );
    return doc.icu_intervals?.length ?? 0;
  } catch {
    return undefined;
  }
}

function round(value: number, places: number): number {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
}

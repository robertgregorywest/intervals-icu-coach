/**
 * Parse and reconcile the lap-timer export.
 *
 * The export is the trustworthy half of the join: it is self-verifiable, in
 * that lap times sum to the cumulative column and distance advances by the lap
 * length. So it gets checked before anything is fitted to it — a split record
 * that does not reconcile is a transcription error, and fitting power to it
 * would give a wrong answer with a good-looking residual.
 */

import type { LapSplit, RunSplits } from "./types.js";

export const DEFAULT_LAP_DISTANCE_METERS = 250;

/**
 * Lap times are exported to two decimals, so their sum drifts from the
 * cumulative column by up to half a centisecond per lap. Anything past that is
 * a real disagreement.
 */
const LAP_SUM_TOLERANCE_BASE_SECONDS = 0.05;
const LAP_SUM_TOLERANCE_PER_LAP_SECONDS = 0.01;

/** Distance is a counter, not a measurement; it should land exactly. */
const DISTANCE_TOLERANCE_METERS = 0.5;

export class SplitParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SplitParseError";
  }
}

/**
 * Parse the exported CSV into runs, preserving the order the export gives.
 *
 * Accepts the export verbatim: a header row is tolerated, extra trailing
 * columns (the export's average speed and cadence) are ignored, and blank
 * lines are skipped.
 */
export function parseLapSplits(
  text: string,
  lapDistanceMeters: number = DEFAULT_LAP_DISTANCE_METERS
): RunSplits[] {
  if (lapDistanceMeters <= 0) {
    throw new SplitParseError(
      `Lap distance must be positive, got ${lapDistanceMeters} m.`
    );
  }

  const rows = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => line.split(",").map((cell) => cell.trim()));

  if (rows.length === 0) {
    throw new SplitParseError("The lap-split record is empty.");
  }

  // A header row is any first row whose numeric columns do not parse.
  const headerRows = isHeaderRow(rows[0]) ? 1 : 0;
  const body = rows.slice(headerRows);
  if (body.length === 0) {
    throw new SplitParseError(
      "The lap-split record has a header row but no laps."
    );
  }

  // Runs keyed in first-seen order, so run 1 stays ahead of run 2 whatever the
  // labels are. Chronological order is what the window assignment relies on.
  const byRun = new Map<string, LapSplit[]>();
  body.forEach((cells, i) => {
    const lineNumber = i + headerRows + 1;
    if (cells.length < 4) {
      throw new SplitParseError(
        `Line ${lineNumber} of the lap-split record has ${cells.length} columns; ` +
          "expected at least four (run, cumulative distance, cumulative time, lap time)."
      );
    }
    const [run, distance, time, lapTime] = cells;
    if (!run) {
      throw new SplitParseError(
        `Line ${lineNumber} of the lap-split record has no run identifier.`
      );
    }
    const laps = byRun.get(run) ?? [];
    laps.push({
      index: laps.length,
      cumulativeDistanceMeters: numberAt(distance, lineNumber, "distance"),
      cumulativeTimeSeconds: numberAt(time, lineNumber, "cumulative time"),
      lapTimeSeconds: numberAt(lapTime, lineNumber, "lap time"),
    });
    byRun.set(run, laps);
  });

  const runs: RunSplits[] = [...byRun.entries()].map(([run, laps]) => ({
    run,
    laps,
    durationSeconds: laps[laps.length - 1].cumulativeTimeSeconds,
    distanceMeters: laps[laps.length - 1].cumulativeDistanceMeters,
  }));

  for (const run of runs) reconcile(run, lapDistanceMeters);
  return runs;
}

/**
 * Check the export against itself. Every failure names the run and the size of
 * the disagreement, because the fix is always a transcription one.
 */
function reconcile(run: RunSplits, lapDistanceMeters: number): void {
  if (run.laps.length < 2) {
    throw new SplitParseError(
      `Run ${run.run} has ${run.laps.length} lap(s); at least two are needed to fit an alignment.`
    );
  }

  const tolerance =
    LAP_SUM_TOLERANCE_BASE_SECONDS +
    LAP_SUM_TOLERANCE_PER_LAP_SECONDS * run.laps.length;

  let summed = 0;
  for (const lap of run.laps) {
    if (lap.lapTimeSeconds <= 0) {
      throw new SplitParseError(
        `Run ${run.run} lap ${lap.index + 1} has a lap time of ${lap.lapTimeSeconds} s.`
      );
    }
    summed += lap.lapTimeSeconds;

    const drift = Math.abs(summed - lap.cumulativeTimeSeconds);
    if (drift > tolerance) {
      throw new SplitParseError(
        `Run ${run.run} does not reconcile: lap times sum to ${summed.toFixed(2)} s ` +
          `by lap ${lap.index + 1} but the cumulative column reads ` +
          `${lap.cumulativeTimeSeconds.toFixed(2)} s, a difference of ${drift.toFixed(2)} s ` +
          `(tolerance ${tolerance.toFixed(2)} s).`
      );
    }

    const expectedDistance = lapDistanceMeters * (lap.index + 1);
    if (
      Math.abs(lap.cumulativeDistanceMeters - expectedDistance) >
      DISTANCE_TOLERANCE_METERS
    ) {
      throw new SplitParseError(
        `Run ${run.run} lap ${lap.index + 1} reads ${lap.cumulativeDistanceMeters} m ` +
          `where ${lapDistanceMeters} m laps give ${expectedDistance} m. ` +
          "Supply lapDistanceMeters if this track is not 250 m."
      );
    }
  }
}

/**
 * Every numeric column must fail to parse. Requiring only one would let a data
 * row with a single corrupt cell be swallowed as a header, turning a
 * transcription error into a silently shorter run.
 */
function isHeaderRow(cells: string[]): boolean {
  const numeric = cells.slice(1, 4);
  return (
    numeric.length > 0 &&
    numeric.every((cell) => !Number.isFinite(Number(cell)))
  );
}

function numberAt(cell: string, lineNumber: number, label: string): number {
  const value = Number(cell);
  if (!Number.isFinite(value)) {
    throw new SplitParseError(
      `Line ${lineNumber} of the lap-split record has "${cell}" where a ${label} was expected.`
    );
  }
  return value;
}

/**
 * Compare runs lap by lap.
 *
 * This is the table `docs/personal/season.md` builds by hand every time a race
 * happens, against every race already on file — which is quadratic hand-typed
 * work with a transcription risk on each cell, and is why the 2025 Nationals
 * splits currently exist in the repo three times over.
 */

import { deriveRun } from "./derive.js";
import { RATIO_DP, round, SECONDS_DP } from "./round.js";
import type {
  ComparisonLapRow,
  ComparisonSummaryRow,
  DerivedRun,
  RunComparison,
  TrackSessionRecord,
} from "./types.js";

export class TrackComparisonError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TrackComparisonError";
  }
}

interface Resolved {
  ref: string;
  record: TrackSessionRecord;
  run: DerivedRun;
}

/**
 * Resolve `<sessionId>` or `<sessionId>#<run>`.
 *
 * A bare id is a convenience for the common single-run session — a race. On a
 * multi-run session it is ambiguous, and guessing the first run would silently
 * compare the wrong effort, so it is refused with the runs listed.
 */
export function resolveRunRef(
  ref: string,
  records: TrackSessionRecord[],
  developmentOf: (r: TrackSessionRecord) => number | undefined,
  segmentLaps?: number
): Resolved {
  const hash = ref.indexOf("#");
  const id = hash === -1 ? ref : ref.slice(0, hash);
  const runLabel = hash === -1 ? undefined : ref.slice(hash + 1);

  const record = records.find((r) => r.basis.id === id);
  if (!record) {
    const available = records.map((r) => r.basis.id).join(", ");
    throw new TrackComparisonError(
      `No track session record with id "${id}".` +
        (available ? ` Available: ${available}.` : " No records are loaded.")
    );
  }

  let splits;
  if (runLabel === undefined) {
    if (record.runs.length !== 1) {
      throw new TrackComparisonError(
        `"${id}" holds ${record.runs.length} runs, so a bare id does not say which. ` +
          `Address one as ${record.runs.map((r) => `${id}#${r.run}`).join(", ")}.`
      );
    }
    splits = record.runs[0];
  } else {
    splits = record.runs.find((r) => r.run === runLabel);
    if (!splits) {
      throw new TrackComparisonError(
        `"${id}" has no run "${runLabel}". Runs present: ${record.runs
          .map((r) => r.run)
          .join(", ")}.`
      );
    }
  }

  return {
    ref,
    record,
    run: deriveRun(record.basis, splits, developmentOf(record), segmentLaps),
  };
}

function delta(
  value: number | undefined,
  base: number | undefined,
  dp: number
) {
  return value === undefined || base === undefined
    ? undefined
    : round(value - base, dp);
}

function summaryRow(
  label: string,
  unit: "seconds" | "ratio",
  values: Array<number | undefined>
): ComparisonSummaryRow {
  const dp = unit === "seconds" ? SECONDS_DP : RATIO_DP;
  return {
    label,
    unit,
    values,
    deltas: values.map((v, i) =>
      i === 0 ? undefined : delta(v, values[0], dp)
    ),
  };
}

export function compareRuns(
  resolved: Resolved[],
  notes: string[] = []
): RunComparison {
  if (resolved.length < 2) {
    throw new TrackComparisonError(
      `A comparison needs at least two runs; ${resolved.length} was given.`
    );
  }

  // A 1500 m run and a 2 km run have no lap-to-lap correspondence. Producing
  // six matched rows and two blank ones would invite exactly the reading the
  // refusal prevents, so this refuses rather than aligning what it can.
  const counts = resolved.map((r) => r.run.summary.flyingLaps);
  if (new Set(counts).size > 1) {
    throw new TrackComparisonError(
      "Runs have different flying-lap counts and cannot be aligned lap by lap: " +
        resolved
          .map((r) => `${r.ref} (${r.run.summary.flyingLaps})`)
          .join(", ") +
        ". Compare runs over the same distance, or read them separately with get_track_session."
    );
  }

  // Standing laps are aligned against each other, so a gate-started run and a
  // flying one line up on the flying portion rather than on lap 1.
  const leadIn = resolved.map(
    (r) => r.run.laps.length - r.run.summary.flyingLaps
  );
  if (new Set(leadIn).size > 1) {
    notes.push(
      "Mixed start types: " +
        resolved.map((r) => `${r.ref} (${r.run.start})`).join(", ") +
        ". Lap rows are aligned on the flying portion, so a standing lap has no counterpart in a flying run."
    );
  }

  const maxLeadIn = Math.max(...leadIn);
  const flyingLaps = counts[0];
  const laps: ComparisonLapRow[] = [];

  for (let i = 0; i < maxLeadIn + flyingLaps; i++) {
    // Position i counts back from the flying portion, so lap 1 of a gate run
    // sits opposite nothing in a flying run rather than opposite its first
    // flying lap.
    const values = resolved.map((r, c) => {
      const idx = i - (maxLeadIn - leadIn[c]);
      return idx < 0 ? undefined : r.run.laps[idx]?.lapTimeSeconds;
    });
    laps.push({
      lap: i + 1,
      standingStart: i < maxLeadIn,
      values,
      deltas: values.map((v, c) =>
        c === 0 ? undefined : delta(v, values[0], SECONDS_DP)
      ),
    });
  }

  const s = (r: Resolved) => r.run.summary;
  const summary: ComparisonSummaryRow[] = [
    summaryRow(
      "Total",
      "seconds",
      resolved.map((r) => s(r).totalTimeSeconds)
    ),
    summaryRow(
      "Flying",
      "seconds",
      resolved.map((r) => s(r).flyingTimeSeconds)
    ),
    summaryRow(
      "Opening",
      "seconds",
      resolved.map((r) => s(r).opening?.timeSeconds)
    ),
    summaryRow(
      "Closing",
      "seconds",
      resolved.map((r) => s(r).closing?.timeSeconds)
    ),
    summaryRow(
      "Decline",
      "ratio",
      resolved.map((r) => s(r).declineRatio)
    ),
  ];

  return {
    refs: resolved.map((r) => r.ref),
    columns: resolved.map((r) => ({
      ref: r.ref,
      date: r.record.basis.date,
      event: r.record.basis.event,
      gear: r.record.basis.gear,
      start: r.run.start,
    })),
    laps,
    summary,
    notes: notes.length ? notes : undefined,
  };
}

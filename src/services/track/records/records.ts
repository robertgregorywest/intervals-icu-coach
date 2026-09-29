import { compareRuns, resolveRunRef, TrackComparisonError } from "./compare.js";
import { deriveRun, developmentFromBasis, startFor } from "./derive.js";
import { recordsDir, type LoadedRecords } from "./loader.js";
import { round } from "../../../shared/round.js";
import { RATE_DP } from "./precision.js";
import type {
  CompareTrackSessionsOptions,
  GetTrackSessionOptions,
  ListTrackSessionsResult,
  RunComparison,
  TrackSessionDetail,
  TrackSessionRecord,
} from "./types.js";

/*
 * The three record operations — list_track_sessions, get_track_session and
 * compare_track_sessions. They read only tracked files: no Intervals.icu
 * endpoint, no API key. Power for these laps comes from the alignment, which
 * owns the join to the SRM.
 */

export function listSessions({
  directory,
  records,
  notes,
}: LoadedRecords): ListTrackSessionsResult {
  return {
    directory,
    sessions: records.map((r) => ({
      id: r.basis.id,
      date: r.basis.date,
      kind: r.basis.kind,
      event: r.basis.event,
      venue: r.basis.venue,
      activityId: r.basis.activityId,
      runs: r.runs.map((run) => ({
        ref: `${r.basis.id}#${run.run}`,
        run: run.run,
        start: startFor(r.basis, run.run),
        laps: run.laps.length,
        distanceMeters: run.distanceMeters,
        durationSeconds: run.durationSeconds,
      })),
    })),
    notes: notes.length ? notes : undefined,
  };
}

export function getSession(
  records: TrackSessionRecord[],
  options: GetTrackSessionOptions
): TrackSessionDetail {
  const record = records.find((r) => r.basis.id === options.id);
  if (!record) {
    const available = records.map((r) => r.basis.id).join(", ");
    throw new TrackComparisonError(
      `No track session record with id "${options.id}".` +
        (available
          ? ` Available: ${available}.`
          : ` No records found in ${recordsDir()}.`)
    );
  }

  const development = developmentFromBasis(record.basis);
  const notes: string[] = [];
  if (!development) {
    notes.push(
      "No gear or development in the record's frontmatter, so cadence is not derived. " +
        "Add `gear: 64x16` (and `rolloutMm` if it is not 2099) or `developmentMeters`."
    );
  }

  return {
    basis: record.basis,
    developmentMeters: round(development?.meters, RATE_DP),
    developmentSource: development?.source,
    prose: record.prose,
    runs: record.runs.map((run) =>
      deriveRun(record.basis, run, development?.meters, options.segmentLaps)
    ),
    notes: notes.length ? notes : undefined,
  };
}

export function compareSessions(
  records: TrackSessionRecord[],
  options: CompareTrackSessionsOptions
): RunComparison {
  const developmentOf = (r: TrackSessionRecord) =>
    developmentFromBasis(r.basis)?.meters;
  const resolved = options.runs.map((ref) =>
    resolveRunRef(ref, records, developmentOf, options.segmentLaps)
  );
  return compareRuns(resolved);
}

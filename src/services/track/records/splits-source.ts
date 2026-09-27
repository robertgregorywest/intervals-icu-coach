/**
 * A stored record's splits, in the inline form the alignment parses.
 *
 * A **Track input** naming a session resolves through here, so the alignment
 * gets the same text it would have been handed had the export been pasted.
 */

import type { TrackSessionRecord } from "./types.js";

/** The header `parseLapSplits` tolerates, written back out for readability. */
const SPLITS_HEADER = "run,cumDist,cumTime,lap";

/**
 * Re-serialise the parsed splits rather than storing the raw block.
 *
 * The record's runs are what `parseLapSplits` produced and reconciled, so
 * writing them back out gives the alignment exactly the numbers the record was
 * checked on. Any extra trailing columns the timing app exported are dropped,
 * which costs nothing — the parser ignores them.
 */
export function serializeSplits(record: TrackSessionRecord): string {
  const rows = record.runs.flatMap((run) =>
    run.laps.map((lap) =>
      [
        run.run,
        lap.cumulativeDistanceMeters,
        lap.cumulativeTimeSeconds,
        lap.lapTimeSeconds,
      ].join(",")
    )
  );
  return [SPLITS_HEADER, ...rows].join("\n");
}

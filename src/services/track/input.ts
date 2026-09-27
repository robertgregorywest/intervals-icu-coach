/**
 * Resolving a **Track input** to the one shape the alignment takes.
 *
 * `compute_track_lap_power` and `write_track_runs` were written before track
 * session records existed, so both took the lap-timer export pasted as text.
 * That left the export typed twice — once into the record, once into the call —
 * and a second transcription is a second chance to get a digit wrong. A
 * `sessionId` closes the loop: the splits come back re-serialised from the
 * record the parser already reconciled, and the activity and lap length come
 * from the same frontmatter.
 *
 * Both `align` and `write` resolve through here, so a previewed alignment and a
 * written one cannot drift apart.
 */

import { normalizeActivityId } from "../activities/index.js";
import type { TrackLapPowerOptions } from "./alignment/types.js";
import { TrackComparisonError } from "./records/compare.js";
import { serializeSplits } from "./records/splits-source.js";
import type { TrackSessionRecord } from "./records/types.js";
import type { TrackInput } from "./types.js";

export class TrackInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TrackInputError";
  }
}

/**
 * The union is the typed contract; it is checked again here because an
 * adapter's arguments are only as typed as its schema, and "exactly one of" is
 * not in the schema — the MCP adapter registers `schema.shape`, which only a
 * plain `ZodObject` has, so a `.refine()` would erase it.
 */
export function resolveTrackInput(
  input: TrackInput,
  records: () => TrackSessionRecord[]
): TrackLapPowerOptions {
  const { activityId, lapDistanceMeters } = input;
  const splits = "splits" in input ? input.splits : undefined;
  const sessionId = "sessionId" in input ? input.sessionId : undefined;

  if (splits && sessionId) {
    throw new TrackInputError(
      "Supply either splits or sessionId, not both — a record's splits and a " +
        "pasted export could disagree, and there is no right way to choose."
    );
  }

  if (!sessionId) {
    if (!splits) {
      throw new TrackInputError(
        "Supply splits (the lap-timer export) or sessionId (a stored record; " +
          "see list_track_sessions)."
      );
    }
    if (activityId === undefined) {
      throw new TrackInputError(
        "activityId is required when splits are pasted — there is no record to " +
          "take it from."
      );
    }
    return {
      activityId: normalizeActivityId(activityId),
      splits,
      lapDistanceMeters,
    };
  }

  const loaded = records();
  const record = loaded.find((r) => r.basis.id === sessionId);
  if (!record) {
    const available = loaded.map((r) => r.basis.id).join(", ");
    throw new TrackComparisonError(
      `No track session record with id "${sessionId}".` +
        (available ? ` Available: ${available}.` : " No records are loaded.")
    );
  }

  const resolvedActivityId = activityId ?? record.basis.activityId;
  if (resolvedActivityId === undefined) {
    // A race recorded from a timing export with no ride behind it — the 2025
    // Nationals record is exactly that. There is nothing to align against.
    throw new TrackInputError(
      `Track session "${record.basis.id}" has no activityId, so there is no ` +
        "ride to align its splits to. Add `activityId:` to the record, or pass " +
        "activityId with this call."
    );
  }

  return {
    activityId: normalizeActivityId(resolvedActivityId),
    splits: serializeSplits(record),
    lapDistanceMeters: lapDistanceMeters ?? record.basis.lapDistanceMeters,
  };
}

/**
 * The inputs `compute_track_lap_power` and `write_track_runs` share.
 *
 * Both tools were written before track session records existed, so both took
 * the lap-timer export pasted as text. That left the export typed twice — once
 * into the record, once into the call — and a second transcription is a second
 * chance to get a digit wrong. `sessionId` closes the loop: the splits come
 * back re-serialised from the record the parser already reconciled, and the
 * activity and lap length come from the same frontmatter.
 *
 * The two shapes are kept in one place because they must not drift: an
 * alignment previewed with `compute_track_lap_power` and then written with
 * `write_track_runs` has to be the same alignment.
 */

import { z } from "zod";
import type { IIntervalsClient } from "../index.js";
import { normalizeActivityId } from "../services/activities/index.js";

export const trackInputFields = {
  activityId: z
    .union([z.string(), z.number()])
    .optional()
    .describe(
      'Completed track activity ID (e.g. "i173732945" from get_activities, or a ' +
        "bare number). Must be the ride the lap splits were timed on. Required " +
        "unless sessionId names a record that carries one; supplying it " +
        "overrides the record's."
    ),
  sessionId: z
    .string()
    .optional()
    .describe(
      "Read the splits from a stored track session record instead of pasting " +
        "them — the id from list_track_sessions. Supply exactly one of this or " +
        "splits."
    ),
  splits: z
    .string()
    .optional()
    .describe(
      "The lap-timer export, pasted as exported. One row per lap: run identifier, " +
        "cumulative distance (m), cumulative time (s), lap time (s). A header row " +
        "and extra trailing columns are fine. Rows are grouped into runs by the " +
        "first column, in the order they appear. Supply exactly one of this or " +
        "sessionId."
    ),
  lapDistanceMeters: z
    .number()
    .positive()
    .optional()
    .describe(
      "Lap length in metres. Defaults to the record's when sessionId is given, " +
        "otherwise 250."
    ),
};

export interface TrackInputArgs {
  activityId?: string | number;
  sessionId?: string;
  splits?: string;
  lapDistanceMeters?: number;
}

export interface ResolvedTrackInputs {
  activityId: string;
  splits: string;
  lapDistanceMeters?: number;
}

export class TrackInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TrackInputError";
  }
}

/**
 * Resolve the pasted-or-stored pair into the one shape the services take.
 *
 * "Exactly one of" is checked here rather than as a schema refinement because
 * the MCP adapter registers `schema.shape`, which only a plain `ZodObject`
 * has — a `.refine()` would erase it.
 */
export function resolveTrackInputs(
  client: IIntervalsClient,
  args: TrackInputArgs
): ResolvedTrackInputs {
  if (args.splits && args.sessionId) {
    throw new TrackInputError(
      "Supply either splits or sessionId, not both — a record's splits and a " +
        "pasted export could disagree, and there is no right way to choose."
    );
  }

  if (!args.sessionId) {
    if (!args.splits) {
      throw new TrackInputError(
        "Supply splits (the lap-timer export) or sessionId (a stored record; " +
          "see list_track_sessions)."
      );
    }
    if (args.activityId === undefined) {
      throw new TrackInputError(
        "activityId is required when splits are pasted — there is no record to " +
          "take it from."
      );
    }
    return {
      activityId: normalizeActivityId(args.activityId),
      splits: args.splits,
      lapDistanceMeters: args.lapDistanceMeters,
    };
  }

  const source = client.trackSessions.resolveTrackSplits(args.sessionId);
  const activityId = args.activityId ?? source.activityId;
  if (activityId === undefined) {
    // A race recorded from a timing export with no ride behind it — the 2025
    // Nationals record is exactly that. There is nothing to align against.
    throw new TrackInputError(
      `Track session "${source.sessionId}" has no activityId, so there is no ` +
        "ride to align its splits to. Add `activityId:` to the record, or pass " +
        "activityId with this call."
    );
  }

  return {
    activityId: normalizeActivityId(activityId),
    splits: source.splits,
    lapDistanceMeters: args.lapDistanceMeters ?? source.lapDistanceMeters,
  };
}

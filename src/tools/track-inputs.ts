/**
 * The schema fields `compute_track_lap_power` and `write_track_runs` share — a
 * **Track input** as an adapter sees it — and the refinement both schemas carry.
 */

import { z } from "zod";

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

/** Spread into `.refine()`: exactly one of `sessionId` or `splits`. */
export const oneSplitsSource = [
  (args: { sessionId?: string; splits?: string }) =>
    (args.sessionId === undefined) !== (args.splits === undefined),
  {
    message:
      "Supply exactly one of splits (the lap-timer export) or sessionId (a " +
      "stored record; see list_track_sessions).",
  },
] as const;

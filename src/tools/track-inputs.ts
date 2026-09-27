/**
 * The schema fields `compute_track_lap_power` and `write_track_runs` share — a
 * **Track input** as an adapter sees it.
 *
 * Every field is optional here: "exactly one of `sessionId` or `splits`" is
 * checked by the Track module, which resolves the input for both Tools, because
 * the MCP adapter registers `schema.shape` and a `.refine()` would erase it.
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

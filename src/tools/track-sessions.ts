import { z } from "zod";
import { defineTool, READ_ONLY } from "./define.js";

const listTrackSessionsSchema = z.object({});

const getTrackSessionSchema = z.object({
  id: z
    .string()
    .min(1)
    .describe(
      'Session id — the record filename without `.md`, e.g. "2026-nationals-ip". ' +
        "Use list_track_sessions to see what is on file."
    ),
  segmentLaps: z
    .number()
    .int()
    .positive()
    .optional()
    .describe(
      "Laps per segment for the opening/closing decomposition. Defaults to the " +
        "widest pair that leaves a lap between them, capped at 3 — which is laps " +
        "2-4 and 6-8 for a 2 km pursuit."
    ),
});

const compareTrackSessionsSchema = z.object({
  runs: z
    .array(z.string().min(1))
    .min(2)
    .describe(
      'Runs to compare, as "<sessionId>" or "<sessionId>#<run>". A bare id works ' +
        "for a single-run session. THE FIRST IS THE BASELINE — every delta is " +
        "taken against it."
    ),
  segmentLaps: z.number().int().positive().optional(),
});

const runStart = z.enum(["gate", "standing", "flying"]);

const basis = z.object({
  id: z.string(),
  date: z.string(),
  kind: z.enum(["race", "training"]),
  event: z.string().optional(),
  venue: z.string().optional(),
  gear: z.string().optional(),
  rolloutMm: z.number(),
  developmentMeters: z.number().optional(),
  crankLengthMm: z.number().optional(),
  suit: z.string().optional(),
  lapDistanceMeters: z.number(),
  activityId: z.string().optional(),
  source: z.string().optional(),
  start: runStart,
  runStarts: z.record(z.string(), runStart),
});

const segment = z.object({
  fromLap: z.number(),
  toLap: z.number(),
  timeSeconds: z.number(),
  meanSpeedMetersPerSecond: z.number(),
});

const listTrackSessionsOutputSchema = z.object({
  directory: z.string(),
  sessions: z.array(
    z.object({
      id: z.string(),
      date: z.string(),
      kind: z.enum(["race", "training"]),
      event: z.string().optional(),
      venue: z.string().optional(),
      activityId: z.string().optional(),
      runs: z.array(
        z.object({
          ref: z.string(),
          run: z.string(),
          start: runStart,
          laps: z.number(),
          distanceMeters: z.number(),
          durationSeconds: z.number(),
        })
      ),
    })
  ),
  notes: z.array(z.string()).optional(),
});

const getTrackSessionOutputSchema = z.object({
  basis,
  developmentMeters: z.number().optional(),
  developmentSource: z.enum(["gear", "supplied"]).optional(),
  prose: z.string(),
  runs: z.array(
    z.object({
      ref: z.string(),
      run: z.string(),
      start: runStart,
      laps: z.array(
        z.object({
          lap: z.number(),
          lapTimeSeconds: z.number(),
          cumulativeTimeSeconds: z.number(),
          speedMetersPerSecond: z.number(),
          cadenceRpm: z.number().optional(),
          standingStart: z.boolean(),
        })
      ),
      summary: z.object({
        totalTimeSeconds: z.number(),
        totalDistanceMeters: z.number(),
        flyingLaps: z.number(),
        flyingTimeSeconds: z.number(),
        flyingDistanceMeters: z.number(),
        meanLapTimeSeconds: z.number(),
        meanSpeedMetersPerSecond: z.number(),
        lapTimeSdSeconds: z.number(),
        opening: segment.optional(),
        closing: segment.optional(),
        declineRatio: z.number().optional(),
        segmentsWithheld: z.string().optional(),
        pacing: z.object({
          sumSquaredSpeed: z.number(),
          rmsSpeedMetersPerSecond: z.number(),
          flatEquivalentTimeSeconds: z.number(),
          gainSeconds: z.number(),
        }),
      }),
    })
  ),
  notes: z.array(z.string()).optional(),
});

const compareTrackSessionsOutputSchema = z.object({
  refs: z.array(z.string()),
  columns: z.array(
    z.object({
      ref: z.string(),
      date: z.string(),
      event: z.string().optional(),
      gear: z.string().optional(),
      start: runStart,
    })
  ),
  laps: z.array(
    z.object({
      lap: z.number(),
      standingStart: z.boolean(),
      values: z.array(z.number().optional()),
      deltas: z.array(z.number().optional()),
    })
  ),
  summary: z.array(
    z.object({
      label: z.string(),
      values: z.array(z.number().optional()),
      deltas: z.array(z.number().optional()),
      unit: z.enum(["seconds", "ratio"]),
    })
  ),
  notes: z.array(z.string()).optional(),
});

export const listTrackSessionsTool = defineTool({
  name: "list_track_sessions",
  description:
    "List the tracked track-session records — every timed session on file, " +
    "with its date, event, gear and each scored run's lap count, distance and " +
    "time. Records hold the lap-timer splits and the measurement basis; " +
    "everything else is derived on read. Reads local files, not Intervals.icu, " +
    "so it returns an empty list plus the directory it searched when the " +
    "athlete keeps no records. Returns: { directory, sessions: [{ id, date, " +
    "kind, event, venue, activityId, runs: [{ ref, run, start, laps, " +
    "distanceMeters, durationSeconds }] }], notes }.",
  schema: listTrackSessionsSchema,
  annotations: READ_ONLY,
  outputSchema: listTrackSessionsOutputSchema,
  handler: (client) => client.track.listSessions(),
});

export const getTrackSessionTool = defineTool({
  name: "get_track_session",
  description:
    "Read one track-session record and everything its timed splits imply: per " +
    "lap the split, cumulative time, speed and the cadence the gear demands; " +
    "per run the flying-portion aggregates (a gate or standing lap is reported " +
    "in full and excluded from every average), the opening and closing segment " +
    "times and speeds, the decline — (v_close/v_open)^3 - 1, a power ratio " +
    "carrying no aero constant — and what even pacing would have been worth " +
    "(sum of squared speeds, RMS speed, flat-equivalent time, gain). " +
    "NO POWER: these are timed laps. For watts and heart rate on the same laps " +
    "use compute_track_lap_power, which fits the splits to the activity's " +
    "streams. Returns: { basis, developmentMeters, prose, runs: [{ ref, run, " +
    "start, laps, summary }], notes }.",
  schema: getTrackSessionSchema,
  annotations: READ_ONLY,
  outputSchema: getTrackSessionOutputSchema,
  handler: (client, args) => client.track.getSession(args),
});

export const compareTrackSessionsTool = defineTool({
  name: "compare_track_sessions",
  description:
    "Compare two or more timed runs lap by lap — the head-to-head table for " +
    "reading a race against the races before it. Each lap position carries " +
    "every run's split and its difference against the FIRST run listed, which " +
    "is the baseline; summary rows give total, flying portion, opening and " +
    "closing segment times, and the decline per run. " +
    "Refuses runs whose flying portions differ in lap count rather than " +
    "returning a half-aligned table — a 1500 m run and a 2 km run have no " +
    'lap-to-lap correspondence. Address a run as "<sessionId>" (a single-run ' +
    'session) or "<sessionId>#<run>". ' +
    "Returns: { refs, columns, laps: [{ lap, standingStart, values, deltas }], " +
    "summary: [{ label, values, deltas, unit }], notes }.",
  schema: compareTrackSessionsSchema,
  annotations: READ_ONLY,
  outputSchema: compareTrackSessionsOutputSchema,
  handler: (client, args) => client.track.compareSessions(args),
});

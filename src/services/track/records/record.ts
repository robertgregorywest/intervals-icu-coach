/**
 * Parse one track session record file.
 *
 * The file is frontmatter (the measurement basis), prose, and one fenced
 * ```splits block holding the lap-timer export verbatim. That block is handed
 * straight to `parseLapSplits` — the parser `compute_track_lap_power` already
 * uses — so a record inherits its reconciliation: lap times must sum to the
 * cumulative column, distance must advance by the lap length, and a run needs
 * at least two laps.
 *
 * That inheritance is the point rather than a convenience. Today a transcription
 * slip in a pasted export is caught once, at the moment of the call. In a record
 * it is caught on every read, forever, and the error already names the run and
 * the size of the disagreement.
 */

import { z } from "zod";
import {
  parseFrontmatter,
  TemplateParseError,
} from "../../workout-library/index.js";
import {
  parseLapSplits,
  SplitParseError,
  DEFAULT_LAP_DISTANCE_METERS,
} from "../alignment/splits.js";
import type { RunStart, SessionBasis, TrackSessionRecord } from "./types.js";

/** A 700×23 track tyre. `track-context.md` §1 validates it at both venues. */
export const DEFAULT_ROLLOUT_MM = 2099;

export class TrackRecordError extends Error {
  constructor(file: string, message: string) {
    super(`${file} — ${message}`);
    this.name = "TrackRecordError";
  }
}

const START_VALUES = ["gate", "standing", "flying"] as const;

/**
 * Frontmatter is flat `key: value`, which is all `parseFrontmatter` supports.
 * Per-run start overrides therefore take a dotted key — `start.Run 3: flying` —
 * rather than a nested block. The split is on the first colon, so a run label
 * may itself contain one.
 */
const START_OVERRIDE_PREFIX = "start.";

const metaSchema = z.object({
  id: z
    .string()
    .min(1)
    .regex(
      /^[a-z0-9][a-z0-9-]*$/,
      "id must be lower-case kebab-case (it is the stable identity a comparison addresses)"
    ),
  // `YYYY-MM` is allowed because it is sometimes all that is known — a race
  // recorded from a timing export months later carries the month, not the day.
  // Writing a plausible day instead would be inventing data into the one file
  // the whole system now trusts. Both forms sort correctly against each other.
  date: z
    .string()
    .regex(
      /^\d{4}-\d{2}(?:-\d{2})?$/,
      "date must be `YYYY-MM-DD`, or `YYYY-MM` where the day is not known"
    ),
  kind: z.enum(["race", "training"]),
  event: z.string().min(1).optional(),
  venue: z.string().min(1).optional(),
  gear: z
    .string()
    .regex(
      /^\d+\s*[x×]\s*\d+$/i,
      'gear must be `chainring x cog`, e.g. `64x16`. Gear inches are not accepted — that convention assumes a 27" wheel, so a nominal figure runs ~2.9% above the true development of a 700×23 track tyre (track-context.md §1).'
    )
    .optional(),
  rolloutMm: z.coerce.number().positive().default(DEFAULT_ROLLOUT_MM),
  developmentMeters: z.coerce.number().positive().optional(),
  crankLengthMm: z.coerce.number().positive().optional(),
  suit: z.string().min(1).optional(),
  lapDistanceMeters: z.coerce
    .number()
    .positive()
    .default(DEFAULT_LAP_DISTANCE_METERS),
  activityId: z.string().min(1).optional(),
  source: z.string().min(1).optional(),
  start: z.enum(START_VALUES).default("flying"),
});

/**
 * `TemplateParseError` renders as `<file> — msg` or `<file>:<line> — msg`, and
 * `TrackRecordError` re-adds the filename. Drop the duplicate, keep the line.
 */
function stripFilePrefix(message: string, file: string): string {
  const escaped = file.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return message.replace(
    new RegExp(`^${escaped}(?::(\\d+))?\\s*—\\s*`),
    (_, line: string | undefined) => (line ? `line ${line}: ` : "")
  );
}

/** Pull the fenced ```splits block out of the body. */
function extractSplitsBlock(body: string, file: string): string {
  const match = body.match(/^[ \t]*```splits[ \t]*\r?\n([\s\S]*?)^[ \t]*```/m);
  if (!match) {
    throw new TrackRecordError(
      file,
      "has no ```splits block. The lap-timer export goes in a fenced block " +
        "tagged `splits`, one row per lap: run, cumulative distance, cumulative time, lap time."
    );
  }
  return match[1];
}

/** Prose is everything before the splits block. */
function extractProse(body: string): string {
  const idx = body.search(/^[ \t]*```splits[ \t]*$/m);
  return (idx === -1 ? body : body.slice(0, idx)).trim();
}

export function parseTrackSessionRecord(
  source: string,
  file: string
): TrackSessionRecord {
  // `parseFrontmatter` is the workout-library's, reused rather than copied.
  // Its messages are format-generic; only the error class names templates, so
  // that is re-wrapped and nothing about workouts leaks into a track record.
  let meta: Record<string, string>;
  let body: string;
  try {
    const parsed = parseFrontmatter(source, file);
    meta = parsed.meta;
    body = parsed.body;
  } catch (err) {
    if (err instanceof TemplateParseError) {
      throw new TrackRecordError(file, stripFilePrefix(err.message, file));
    }
    throw err;
  }

  const runStarts: Record<string, RunStart> = {};
  const known: Record<string, string> = {};
  for (const [key, value] of Object.entries(meta)) {
    if (key.startsWith(START_OVERRIDE_PREFIX)) {
      const run = key.slice(START_OVERRIDE_PREFIX.length).trim();
      if (!run) {
        throw new TrackRecordError(
          file,
          `\`${key}\` names no run. Per-run overrides read \`start.<run label>: flying\`.`
        );
      }
      const parsed = z.enum(START_VALUES).safeParse(value);
      if (!parsed.success) {
        throw new TrackRecordError(
          file,
          `\`${key}\` is ${JSON.stringify(value)}; expected one of ${START_VALUES.join(", ")}.`
        );
      }
      runStarts[run] = parsed.data;
      continue;
    }
    known[key] = value;
  }

  const result = metaSchema.safeParse(known);
  if (!result.success) {
    const detail = result.error.issues
      .map((i) => `\`${i.path.join(".") || "(root)"}\`: ${i.message}`)
      .join("; ");
    throw new TrackRecordError(file, `frontmatter is invalid — ${detail}`);
  }
  const m = result.data;

  const splits = extractSplitsBlock(body, file);
  let runs;
  try {
    runs = parseLapSplits(splits, m.lapDistanceMeters);
  } catch (err) {
    // The reconciliation message already names the run and the size of the
    // disagreement; all it lacks is which record to open.
    if (err instanceof SplitParseError) {
      throw new TrackRecordError(file, err.message);
    }
    throw err;
  }

  // A start override naming a run that is not in the export is a typo that
  // would otherwise silently leave that run on the session default — and the
  // default decides which laps are aggregated, so it is not a small silence.
  const labels = new Set(runs.map((r) => r.run));
  for (const run of Object.keys(runStarts)) {
    if (!labels.has(run)) {
      throw new TrackRecordError(
        file,
        `\`${START_OVERRIDE_PREFIX}${run}\` names a run the export does not contain. ` +
          `Runs present: ${[...labels].join(", ")}.`
      );
    }
  }

  const basis: SessionBasis = {
    id: m.id,
    date: m.date,
    kind: m.kind,
    event: m.event,
    venue: m.venue,
    gear: m.gear,
    rolloutMm: m.rolloutMm,
    developmentMeters: m.developmentMeters,
    crankLengthMm: m.crankLengthMm,
    suit: m.suit,
    lapDistanceMeters: m.lapDistanceMeters,
    activityId: m.activityId,
    source: m.source,
    start: m.start,
    runStarts,
  };

  return { basis, prose: extractProse(body), runs, file };
}

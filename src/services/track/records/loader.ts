import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseTrackSessionRecord, TrackRecordError } from "./record.js";
import type { TrackSessionRecord } from "./types.js";

/**
 * Records live in the private `docs/personal/` repo, alongside `season.md`,
 * `coaching-log.md` and `track-context.md` — race splits are personal data and
 * that is where personal data already lives, already committed and pushed.
 *
 * The module-relative path is the same trick `workout-library/loader.ts` uses,
 * for the same reason: `src/`, `dist/` and the unpacked bundle sit at equal
 * depth, so the server reads the file you just edited.
 */
export const DEFAULT_RECORDS_DIR = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../../../docs/personal/track"
);

export function recordsDir(): string {
  return (
    process.env.INTERVALS_TRACK_SESSIONS_DIR?.trim() || DEFAULT_RECORDS_DIR
  );
}

export interface LoadedRecords {
  directory: string;
  records: TrackSessionRecord[];
  notes: string[];
}

/**
 * Load every record in the directory.
 *
 * **Deliberately more forgiving than `loadTemplates`, which throws on a missing
 * directory.** That is correct there: `templates/workouts/` ships inside the
 * bundle, so its absence is corruption. This directory ships nowhere. For every
 * install but the athlete's own it does not exist and never will, so its absence
 * is the ordinary case and returns an empty list plus a note naming the path.
 * An MCP server that refused to start because an athlete keeps no track records
 * would be a bug caused by copying the pattern too faithfully.
 */
export function loadTrackSessionRecords(
  dir: string = recordsDir()
): LoadedRecords {
  const notes: string[] = [];

  if (!existsSync(dir) || !statSync(dir).isDirectory()) {
    return {
      directory: dir,
      records: [],
      notes: [
        `No track session records: ${dir} does not exist. ` +
          "Records are Markdown files with a basis in frontmatter and the lap-timer " +
          "export in a ```splits block; set INTERVALS_TRACK_SESSIONS_DIR to look elsewhere.",
      ],
    };
  }

  // A records directory is a directory in a git repo, so it will acquire a
  // README sooner or later, and a draft record is naturally parked under a
  // leading underscore. Neither is a record, and failing to load the whole
  // directory because one of them is present would be the wrong reading.
  const files = readdirSync(dir)
    .filter(
      (f) =>
        f.endsWith(".md") &&
        !f.startsWith("_") &&
        f.toLowerCase() !== "readme.md"
    )
    .sort();

  if (files.length === 0) {
    notes.push(`No track session records found in ${dir}.`);
  }

  const records: TrackSessionRecord[] = [];
  const seen = new Map<string, string>();

  for (const file of files) {
    const record = parseTrackSessionRecord(
      readFileSync(join(dir, file), "utf8"),
      file
    );
    const previous = seen.get(record.basis.id);
    if (previous) {
      throw new TrackRecordError(
        file,
        `duplicate id "${record.basis.id}" — already used by ${previous}. ` +
          "The id is how a comparison addresses a run, so it must be unique."
      );
    }
    seen.set(record.basis.id, file);
    records.push(record);
  }

  records.sort((a, b) => a.basis.date.localeCompare(b.basis.date));
  return { directory: dir, records, notes };
}

/**
 * Loading a directory of records.
 *
 * The interesting case is the empty one. `docs/personal/` is gitignored, so for
 * every install but the athlete's own the records directory does not exist —
 * that has to be an empty list with a note, not a throw, or the server fails to
 * answer for a reason that is nobody's fault.
 */

import { describe, it, expect, afterEach } from "vitest";
import { mkdtempSync, rmSync, writeFileSync, cpSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  loadTrackSessionRecords,
  recordsDir,
  DEFAULT_RECORDS_DIR,
} from "../../../../src/services/track/records/loader.js";
import { TrackRecordError } from "../../../../src/services/track/records/record.js";

const FIXTURES = fileURLToPath(
  new URL("../../../fixtures/track-sessions", import.meta.url)
);

const temps: string[] = [];
function temp(): string {
  const dir = mkdtempSync(join(tmpdir(), "track-records-"));
  temps.push(dir);
  return dir;
}

afterEach(() => {
  while (temps.length) rmSync(temps.pop()!, { recursive: true, force: true });
  delete process.env.INTERVALS_TRACK_SESSIONS_DIR;
});

describe("recordsDir", () => {
  it("defaults to the private records directory", () => {
    expect(recordsDir()).toBe(DEFAULT_RECORDS_DIR);
    // At the repository root, wherever the loader file sits beneath src/.
    expect(DEFAULT_RECORDS_DIR).toBe(
      fileURLToPath(new URL("../../../../docs/personal/track", import.meta.url))
    );
  });

  it("is overridable, so a second athlete keeps records elsewhere", () => {
    process.env.INTERVALS_TRACK_SESSIONS_DIR = "/somewhere/else";
    expect(recordsDir()).toBe("/somewhere/else");
  });

  it("ignores a blank override rather than looking in the empty path", () => {
    process.env.INTERVALS_TRACK_SESSIONS_DIR = "   ";
    expect(recordsDir()).toBe(DEFAULT_RECORDS_DIR);
  });
});

describe("loadTrackSessionRecords", () => {
  it("loads every record and orders them by date", () => {
    const { records, notes } = loadTrackSessionRecords(FIXTURES);
    expect(records.map((r) => r.basis.id)).toEqual([
      "2025-nationals-ip",
      "2026-nationals-ip",
      "2026-07-12-training",
      "2026-09-06-bmrc-ip",
    ]);
    expect(notes).toEqual([]);
  });

  it("skips a README, which a records directory will acquire", () => {
    // The fixtures directory has one, explaining why the prose is trimmed.
    expect(
      loadTrackSessionRecords(FIXTURES).records.some((r) =>
        r.file.toLowerCase().includes("readme")
      )
    ).toBe(false);
  });

  it("skips an underscore-prefixed draft", () => {
    const dir = temp();
    cpSync(join(FIXTURES, "2026-nationals-ip.md"), join(dir, "_draft.md"));
    expect(loadTrackSessionRecords(dir).records).toHaveLength(0);
  });

  it("reports a missing directory as empty, naming where it looked", () => {
    const missing = join(temp(), "no-such-dir");
    const { directory, records, notes } = loadTrackSessionRecords(missing);
    expect(directory).toBe(missing);
    expect(records).toEqual([]);
    expect(notes[0]).toContain(missing);
    expect(notes[0]).toContain("INTERVALS_TRACK_SESSIONS_DIR");
  });

  it("reports an empty directory as empty", () => {
    const { records, notes } = loadTrackSessionRecords(temp());
    expect(records).toEqual([]);
    expect(notes[0]).toMatch(/No track session records found/);
  });

  it("refuses two records sharing an id", () => {
    // The id is the address a comparison takes, so a duplicate would silently
    // decide which of two races a reference means.
    const dir = temp();
    for (const name of ["a.md", "b.md"]) {
      cpSync(join(FIXTURES, "2026-nationals-ip.md"), join(dir, name));
    }
    expect(() => loadTrackSessionRecords(dir)).toThrow(TrackRecordError);
    expect(() => loadTrackSessionRecords(dir)).toThrow(
      /duplicate id "2026-nationals-ip" — already used by a\.md/
    );
  });

  it("names the offending file when one record is malformed", () => {
    const dir = temp();
    cpSync(join(FIXTURES, "2026-nationals-ip.md"), join(dir, "good.md"));
    writeFileSync(join(dir, "broken.md"), "not a record\n");
    expect(() => loadTrackSessionRecords(dir)).toThrow(/broken\.md/);
  });
});

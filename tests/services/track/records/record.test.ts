/**
 * The record format, and the four ways it is allowed to fail.
 *
 * The reconciliation test is the load-bearing one. A record is read on every
 * request, so a transcription slip that gets past the parser is wrong forever
 * and silently — which is precisely the failure mode the prose tables this
 * replaces were prone to.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  parseTrackSessionRecord,
  TrackRecordError,
} from "../../../../src/services/track/records/record.js";

function read(dir: string, name: string): string {
  return readFileSync(
    fileURLToPath(new URL(`../../../fixtures/${dir}/${name}`, import.meta.url)),
    "utf8"
  );
}

const good = (name: string) => read("track-sessions", name);
const bad = (name: string) => read("track-sessions-bad", name);

describe("parseTrackSessionRecord", () => {
  it("reads the basis, the prose and the export", () => {
    const r = parseTrackSessionRecord(
      good("2026-nationals-ip.md"),
      "2026-nationals-ip.md"
    );
    expect(r.basis.id).toBe("2026-nationals-ip");
    expect(r.basis.kind).toBe("race");
    expect(r.basis.gear).toBe("65x16");
    expect(r.basis.rolloutMm).toBe(2099);
    expect(r.basis.crankLengthMm).toBe(165);
    expect(r.basis.lapDistanceMeters).toBe(250);
    expect(r.basis.start).toBe("gate");
    expect(r.prose).toContain("2:15.42");
    expect(r.runs).toHaveLength(1);
    expect(r.runs[0].run).toBe("race");
    expect(r.runs[0].laps).toHaveLength(8);
    expect(r.runs[0].durationSeconds).toBe(135.42);
  });

  it("reads a multi-run session in export order", () => {
    const r = parseTrackSessionRecord(
      good("2026-07-12-training.md"),
      "2026-07-12-training.md"
    );
    expect(r.runs.map((x) => x.run)).toEqual(["run-1", "run-2", "run-3"]);
    expect(r.runs.map((x) => x.laps.length)).toEqual([6, 6, 8]);
  });

  it("accepts a month-only date, where the day is not known", () => {
    const r = parseTrackSessionRecord(
      good("2025-nationals-ip.md"),
      "2025-nationals-ip.md"
    );
    expect(r.basis.date).toBe("2025-06");
  });

  it("defaults the rollout and the lap distance", () => {
    const r = parseTrackSessionRecord(
      bad("bad-reconcile.md").replace(
        "run-1,750,48.70,15.50",
        "run-1,750,48.70,16.50"
      ),
      "x.md"
    );
    expect(r.basis.rolloutMm).toBe(2099);
    expect(r.basis.lapDistanceMeters).toBe(250);
  });

  it("rejects splits that do not reconcile, naming the record and the run", () => {
    expect(() =>
      parseTrackSessionRecord(bad("bad-reconcile.md"), "bad-reconcile.md")
    ).toThrow(TrackRecordError);
    expect(() =>
      parseTrackSessionRecord(bad("bad-reconcile.md"), "bad-reconcile.md")
    ).toThrow(/bad-reconcile\.md.*Run run-1 does not reconcile/s);
  });

  it("rejects gear inches, which sit ~2.9% above a real rollout", () => {
    expect(() =>
      parseTrackSessionRecord(bad("bad-gear.md"), "bad-gear.md")
    ).toThrow(/gear must be `chainring x cog`/);
  });

  it("rejects a record with no splits block", () => {
    expect(() =>
      parseTrackSessionRecord(bad("bad-no-splits.md"), "bad-no-splits.md")
    ).toThrow(/has no ```splits block/);
  });

  it("rejects a start override naming a run the export lacks", () => {
    // Silently defaulting would leave that run on the session's start type,
    // which decides which laps every aggregate covers.
    expect(() =>
      parseTrackSessionRecord(
        bad("bad-start-override.md"),
        "bad-start-override.md"
      )
    ).toThrow(/names a run the export does not contain.*Runs present: run-1/s);
  });

  it("applies a start override to the run it names", () => {
    const source = bad("bad-start-override.md").replace(
      "start.run-9:",
      "start.run-1:"
    );
    const r = parseTrackSessionRecord(source, "x.md");
    expect(r.basis.runStarts).toEqual({ "run-1": "gate" });
  });

  it("rejects a record with no frontmatter", () => {
    expect(() =>
      parseTrackSessionRecord("no frontmatter here", "x.md")
    ).toThrow(/must start with a `---` frontmatter fence/);
  });

  it("rejects an id that is not kebab-case", () => {
    const source = good("2026-nationals-ip.md").replace(
      "id: 2026-nationals-ip",
      "id: Nationals 2026"
    );
    expect(() => parseTrackSessionRecord(source, "x.md")).toThrow(
      /id must be lower-case kebab-case/
    );
  });
});

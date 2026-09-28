/**
 * The head-to-head, checked against the table `docs/personal/season.md` built by
 * hand for the 6 Sept benchmark.
 *
 * That table is the acceptance test for this whole change: it is the artefact
 * the service exists to stop anyone typing again, and it was computed
 * independently, so reproducing it cell for cell is the evidence the tool can
 * replace it.
 */

import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createTrack } from "../../../../src/services/track/index.js";
import type { IActivitiesApi } from "../../../../src/services/activities/index.js";
import { loadTrackSessionRecords } from "../../../../src/services/track/records/loader.js";
import { parseTrackSessionRecord } from "../../../../src/services/track/records/record.js";
import { TrackComparisonError } from "../../../../src/services/track/records/compare.js";
import type { ComparisonSummaryRow } from "../../../../src/services/track/records/types.js";
import { createFitCodec } from "../../../../src/services/fit/index.js";

/** The record operations read files only; nothing here reaches the API. */
const NO_API = {} as IActivitiesApi;

const FIXTURES = fileURLToPath(
  new URL("../../../fixtures/track-sessions", import.meta.url)
);

const service = createTrack({
  activitiesApi: NO_API,
  fit: createFitCodec(),
  load: () => loadTrackSessionRecords(FIXTURES),
});

function row(
  rows: ComparisonSummaryRow[],
  label: string
): ComparisonSummaryRow {
  const found = rows.find((r) => r.label === label);
  if (!found) throw new Error(`no summary row "${label}"`);
  return found;
}

describe("compareSessions — the season.md benchmark table", () => {
  it("reproduces the three-way race comparison", async () => {
    const c = await service.compareSessions({
      runs: ["2026-09-06-bmrc-ip", "2026-nationals-ip", "2025-nationals-ip"],
    });

    expect(c.refs).toEqual([
      "2026-09-06-bmrc-ip",
      "2026-nationals-ip",
      "2025-nationals-ip",
    ]);
    expect(c.columns.map((col) => col.gear)).toEqual([
      "64x16",
      "65x16",
      "65x16",
    ]);

    // Eight laps, the first standing in all three.
    expect(c.laps).toHaveLength(8);
    expect(c.laps[0].standingStart).toBe(true);
    expect(c.laps.slice(1).every((l) => !l.standingStart)).toBe(true);

    // season.md's delta column, against 6 Sept as the baseline.
    expect(c.laps.map((l) => l.deltas[1])).toEqual([
      0.35, -0.28, -0.13, -0.02, -0.14, 0.18, 0.17, 0.07,
    ]);

    const total = row(c.summary, "Total");
    expect(total.values).toEqual([135.22, 135.42, 134.3]);
    expect(total.deltas).toEqual([undefined, 0.2, -0.92]);

    expect(row(c.summary, "Flying").deltas).toEqual([undefined, -0.15, -0.94]);

    // The openings were near-identical; the difference is all in the close.
    expect(row(c.summary, "Opening").values).toEqual([47.07, 46.64, 46.72]);
    expect(row(c.summary, "Closing").values).toEqual([49.17, 49.59, 48.84]);

    // season.md: −12.3 / −16.8 / −12.5%.
    const decline = row(c.summary, "Decline");
    expect(decline.unit).toBe("ratio");
    expect(decline.values.map((v) => Number((v! * 100).toFixed(1)))).toEqual([
      -12.3, -16.8, -12.5,
    ]);
  });

  it("flips every delta when the baseline changes, leaving the values alone", async () => {
    // season.md quotes the same comparison from the other side. The lap times
    // are measurements and must not move; only the deltas are relative.
    const forward = await service.compareSessions({
      runs: ["2026-09-06-bmrc-ip", "2026-nationals-ip"],
    });
    const reversed = await service.compareSessions({
      runs: ["2026-nationals-ip", "2026-09-06-bmrc-ip"],
    });

    expect(reversed.laps.map((l) => l.values[0])).toEqual(
      forward.laps.map((l) => l.values[1])
    );
    expect(reversed.laps.map((l) => l.deltas[1])).toEqual(
      forward.laps.map((l) => -l.deltas[1]!)
    );
    expect(row(reversed.summary, "Total").deltas[1]).toBe(
      -row(forward.summary, "Total").deltas[1]!
    );
  });

  it("addresses one run of a multi-run session by ref", async () => {
    const c = await service.compareSessions({
      runs: ["2026-07-12-training#run-1", "2026-07-12-training#run-2"],
    });
    expect(c.refs).toEqual([
      "2026-07-12-training#run-1",
      "2026-07-12-training#run-2",
    ]);
    expect(c.laps).toHaveLength(6);
    expect(c.laps.every((l) => !l.standingStart)).toBe(true);
  });

  it("notes a mixed start and aligns on the flying portion", async () => {
    // A gate race and a flying effort over the same seven ridden laps. The two
    // are comparable lap for lap only once the gate lap — an acceleration, not
    // a held speed — is set opposite nothing.
    const flying = [
      "---",
      "id: flying-seven",
      "date: 2026-08-01",
      "kind: training",
      "gear: 65x16",
      "start: flying",
      "---",
      "",
      "A seven-lap flying effort.",
      "",
      "```splits",
      "run,cumDist,cumTime,lap",
      ...[16.0, 16.0, 16.1, 16.2, 16.3, 16.4, 16.5].map((lap, i, all) => {
        const cum = all.slice(0, i + 1).reduce((a, v) => a + v, 0);
        return `run-1,${(i + 1) * 250},${cum.toFixed(2)},${lap.toFixed(2)}`;
      }),
      "```",
      "",
    ].join("\n");

    const mixed = createTrack({
      activitiesApi: NO_API,
      fit: createFitCodec(),
      load: () => {
        const loaded = loadTrackSessionRecords(FIXTURES);
        return {
          ...loaded,
          records: [
            ...loaded.records,
            parseTrackSessionRecord(flying, "flying-seven.md"),
          ],
        };
      },
    });

    const c = await mixed.compareSessions({
      runs: ["2026-nationals-ip", "flying-seven"],
    });
    expect(c.laps).toHaveLength(8);
    expect(c.laps[0].standingStart).toBe(true);
    expect(c.laps[0].values[1]).toBeUndefined();
    // Lap 2 of the race — its first flying lap — lines up with lap 1 of the
    // flying effort.
    expect(c.laps[1].values).toEqual([15.59, 16.0]);
    expect(c.notes?.join(" ")).toMatch(/Mixed start types/);
  });

  it("refuses runs of different lengths rather than half-matching them", async () => {
    await expect(
      service.compareSessions({
        runs: ["2026-nationals-ip", "2026-07-12-training#run-1"],
      })
    ).rejects.toThrow(/different flying-lap counts/);
  });

  it("refuses a bare id on a multi-run session, listing the runs", async () => {
    await expect(
      service.compareSessions({
        runs: ["2026-nationals-ip", "2026-07-12-training"],
      })
    ).rejects.toThrow(/holds 3 runs.*2026-07-12-training#run-1/s);
  });

  it("refuses an unknown id, listing what is available", async () => {
    await expect(
      service.compareSessions({
        runs: ["2026-nationals-ip", "no-such-session"],
      })
    ).rejects.toThrow(
      /No track session record with id "no-such-session".*Available:/s
    );
  });

  it("refuses an unknown run label on a known session", async () => {
    await expect(
      service.compareSessions({
        runs: ["2026-nationals-ip", "2026-07-12-training#run-9"],
      })
    ).rejects.toThrow(/has no run "run-9". Runs present: run-1, run-2, run-3/);
  });

  it("refuses a comparison of fewer than two runs", async () => {
    await expect(
      service.compareSessions({ runs: ["2026-nationals-ip"] })
    ).rejects.toThrow(TrackComparisonError);
  });
});

describe("listSessions", () => {
  it("lists every session with its runs, in date order", async () => {
    const { directory, sessions, notes } = await service.listSessions();
    expect(directory).toBe(FIXTURES);
    expect(notes).toBeUndefined();
    expect(sessions.map((s) => s.id)).toEqual([
      "2025-nationals-ip",
      "2026-nationals-ip",
      "2026-07-12-training",
      "2026-09-06-bmrc-ip",
    ]);

    const training = sessions.find((s) => s.id === "2026-07-12-training")!;
    expect(training.kind).toBe("training");
    expect(training.runs.map((r) => r.ref)).toEqual([
      "2026-07-12-training#run-1",
      "2026-07-12-training#run-2",
      "2026-07-12-training#run-3",
    ]);
    expect(training.runs.map((r) => r.start)).toEqual([
      "flying",
      "flying",
      "flying",
    ]);
    expect(training.runs.map((r) => r.distanceMeters)).toEqual([
      1500, 1500, 2000,
    ]);

    const bmrc = sessions.find((s) => s.id === "2026-09-06-bmrc-ip")!;
    expect(bmrc.activityId).toBe("i183857008");
    expect(bmrc.runs[0].start).toBe("gate");
  });

  it("passes the loader's notes through when there are no records", async () => {
    const empty = createTrack({
      activitiesApi: NO_API,
      fit: createFitCodec(),
      load: () => loadTrackSessionRecords("/no/such/directory"),
    });
    const result = await empty.listSessions();
    expect(result.sessions).toEqual([]);
    expect(result.notes?.[0]).toContain("/no/such/directory");
  });
});

describe("getSession", () => {
  it("returns the basis, the prose and every run derived", async () => {
    const s = await service.getSession({ id: "2026-nationals-ip" });
    expect(s.basis.gear).toBe("65x16");
    expect(s.developmentSource).toBe("gear");
    expect(s.developmentMeters).toBeCloseTo(8.527, 3);
    expect(s.prose).toContain("2:15.42");
    expect(s.runs).toHaveLength(1);
    expect(s.runs[0].laps).toHaveLength(8);
    expect(s.notes).toBeUndefined();
  });

  it("notes the missing gear rather than omitting cadence silently", async () => {
    const source = readFileSync(join(FIXTURES, "2026-nationals-ip.md"), "utf8")
      .replace("gear: 65x16\n", "")
      .replace("id: 2026-nationals-ip", "id: no-gear");
    const nogear = createTrack({
      activitiesApi: NO_API,
      fit: createFitCodec(),
      load: () => ({
        directory: FIXTURES,
        // Reuse the real parser so the record is exactly what a file gives.
        records: [parseTrackSessionRecord(source, "no-gear.md")],
        notes: [],
      }),
    });
    const s = await nogear.getSession({ id: "no-gear" });
    expect(s.developmentMeters).toBeUndefined();
    expect(s.notes?.[0]).toMatch(/cadence is not derived/);
  });

  it("refuses an unknown id, listing what is available", async () => {
    await expect(service.getSession({ id: "nope" })).rejects.toThrow(
      /No track session record with id "nope".*Available:/s
    );
  });

  it("threads segmentLaps through to every run", async () => {
    const s = await service.getSession({
      id: "2026-nationals-ip",
      segmentLaps: 2,
    });
    expect(s.runs[0].summary.opening).toMatchObject({ fromLap: 2, toLap: 3 });
    expect(s.runs[0].summary.closing).toMatchObject({ fromLap: 7, toLap: 8 });
  });
});

describe("the fixtures themselves", () => {
  it("keep the athlete's coaching prose out of this repository", () => {
    // docs/personal/ is gitignored on purpose. Copying records wholesale would
    // publish coaching commentary as a side effect of writing a test, so the
    // fixtures carry the basis and the splits and a single line of context.
    for (const file of readdirSync(FIXTURES).filter((f) => f.endsWith(".md"))) {
      if (file.toLowerCase() === "readme.md") continue;
      const prose = readFileSync(join(FIXTURES, file), "utf8")
        .split("```splits")[0]
        .split("---")
        .slice(2)
        .join("---")
        .trim();
      expect(
        prose.split(/\n\s*\n/).length,
        `${file} prose`
      ).toBeLessThanOrEqual(2);
    }
  });
});

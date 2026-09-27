import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  assignRunsToWindows,
  detectCandidateWindows,
  searchRange,
  WindowError,
} from "../../../../src/services/track/alignment/windows.js";
import { parseLapSplits } from "../../../../src/services/track/alignment/splits.js";
import type {
  CandidateWindow,
  RunSplits,
} from "../../../../src/services/track/alignment/types.js";

function fixture(name: string) {
  return JSON.parse(
    readFileSync(
      fileURLToPath(
        new URL(
          `../../../fixtures/track-lap-alignment/${name}`,
          import.meta.url
        )
      ),
      "utf8"
    )
  );
}

const SESSION = fixture("track-session-2026-08-08.json");
const RUNS = parseLapSplits(
  readFileSync(
    fileURLToPath(
      new URL(
        "../../../fixtures/track-lap-alignment/splits-2026-08-08.csv",
        import.meta.url
      )
    ),
    "utf8"
  )
);

const shortestRun = Math.min(...RUNS.map((r) => r.durationSeconds));

describe("detectCandidateWindows", () => {
  it("finds one window per run in the session", () => {
    const windows = detectCandidateWindows(
      SESSION.time,
      SESSION.cadence,
      shortestRun
    );
    expect(windows).toHaveLength(4);
  });

  it("returns windows in chronological order, each long enough to hold a run", () => {
    const windows = detectCandidateWindows(
      SESSION.time,
      SESSION.cadence,
      shortestRun
    );
    for (let i = 1; i < windows.length; i++) {
      expect(windows[i].startSeconds).toBeGreaterThan(
        windows[i - 1].endSeconds
      );
    }
    for (const w of windows) {
      expect(w.endSeconds - w.startSeconds).toBeGreaterThan(shortestRun * 0.75);
    }
  });

  it("ignores easy riding, however long", () => {
    const times = Array.from({ length: 600 }, (_, i) => i);
    const cadence = times.map((t) => (t > 300 && t < 460 ? 110 : 85));
    const windows = detectCandidateWindows(times, cadence, 120);
    expect(windows).toHaveLength(1);
    expect(windows[0].startSeconds).toBeGreaterThanOrEqual(300);
    expect(windows[0].endSeconds).toBeLessThanOrEqual(462);
  });

  it("finds nothing in a stream with no cadence at all", () => {
    const times = Array.from({ length: 300 }, (_, i) => i);
    expect(
      detectCandidateWindows(
        times,
        times.map(() => 0),
        100
      )
    ).toEqual([]);
  });
});

describe("searchRange", () => {
  const run = RUNS[0];

  it("extends either side of the window so a rolling entry is reachable", () => {
    const range = searchRange(
      { startSeconds: 100, endSeconds: 260 },
      run,
      0,
      1000
    );
    expect(range).not.toBeNull();
    expect(range!.low).toBe(75);
    expect(range!.high).toBeCloseTo(285 - run.durationSeconds, 5);
  });

  it("is clamped to the stream", () => {
    const range = searchRange(
      { startSeconds: 5, endSeconds: 160 },
      run,
      0,
      160
    );
    expect(range!.low).toBe(0);
    expect(range!.high).toBeCloseTo(160 - run.durationSeconds, 5);
  });

  it("returns null when the run cannot fit", () => {
    expect(
      searchRange({ startSeconds: 0, endSeconds: 40 }, run, 0, 50)
    ).toBeNull();
  });
});

describe("assignRunsToWindows", () => {
  const windows: CandidateWindow[] = [
    { startSeconds: 0, endSeconds: 150 },
    { startSeconds: 300, endSeconds: 450 },
    { startSeconds: 600, endSeconds: 750 },
    { startSeconds: 900, endSeconds: 1050 },
  ];

  it("gives two same-length runs distinct windows", () => {
    // Both runs fit window 0 best; only one can have it.
    const cost = (runIndex: number, windowIndex: number) =>
      windowIndex === 0 ? 0.5 : 0.6 + runIndex * 0.01;
    const assigned = assignRunsToWindows(RUNS.slice(2), windows, cost);
    expect(assigned).toHaveLength(2);
    expect(assigned[0].window).not.toBe(assigned[1].window);
  });

  it("keeps runs in the order the export gives them", () => {
    const cost = () => 1;
    const assigned = assignRunsToWindows(RUNS, windows, cost);
    expect(assigned.map((a) => a.run.run)).toEqual(["1", "2", "3", "4"]);
    expect(assigned.map((a) => a.window.startSeconds)).toEqual([
      0, 300, 600, 900,
    ]);
  });

  it("skips a spare window rather than forcing a run into it", () => {
    // Run 1 fits window 1 far better than window 0.
    const cost = (runIndex: number, windowIndex: number) => {
      if (runIndex === 0) return windowIndex === 1 ? 0.4 : 5;
      return windowIndex >= 2 ? 0.4 : 5;
    };
    const assigned = assignRunsToWindows(RUNS.slice(0, 2), windows, cost);
    expect(assigned[0].window.startSeconds).toBe(300);
    expect(assigned[1].window.startSeconds).toBe(600);
  });

  it("rejects a session with fewer windows than runs", () => {
    expect(() =>
      assignRunsToWindows(RUNS, windows.slice(0, 3), () => 1)
    ).toThrow(WindowError);
    expect(() =>
      assignRunsToWindows(RUNS, windows.slice(0, 3), () => 1)
    ).toThrow(
      /3 candidate window\(s\) but the lap-split record has 4 run\(s\)/
    );
  });

  it("names a run that fits no window", () => {
    const stubborn: RunSplits[] = RUNS.slice(0, 2);
    const cost = (runIndex: number) => (runIndex === 1 ? null : 0.5);
    expect(() => assignRunsToWindows(stubborn, windows, cost)).toThrow(
      /Run 2 \(113\.42 s\) does not fit any candidate window/
    );
  });
});

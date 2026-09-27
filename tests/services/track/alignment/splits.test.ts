import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  parseLapSplits,
  SplitParseError,
} from "../../../../src/services/track/alignment/splits.js";

const EXPORT = readFileSync(
  fileURLToPath(
    new URL(
      "../../../fixtures/track-lap-alignment/splits-2026-08-08.csv",
      import.meta.url
    )
  ),
  "utf8"
);

describe("parseLapSplits", () => {
  it("parses the 2026-08-08 export as exported", () => {
    const runs = parseLapSplits(EXPORT);

    expect(runs.map((r) => r.run)).toEqual(["1", "2", "3", "4"]);
    expect(runs.map((r) => r.laps.length)).toEqual([7, 7, 8, 8]);
    expect(runs.map((r) => r.durationSeconds)).toEqual([
      114.26, 113.42, 131.81, 131.18,
    ]);
    expect(runs.map((r) => r.distanceMeters)).toEqual([1750, 1750, 2000, 2000]);
  });

  it("tolerates a missing header row", () => {
    const headerless = EXPORT.split("\n").slice(1).join("\n");
    expect(parseLapSplits(headerless).map((r) => r.run)).toEqual([
      "1",
      "2",
      "3",
      "4",
    ]);
  });

  it("ignores trailing columns the export carries", () => {
    const withSpeed =
      "run,distance_m,time_s,lap_time_s,avg_speed_kph\n" +
      "1,250,16.26,16.26,55.34\n" +
      "1,500,32.69,16.43,54.78\n";
    expect(parseLapSplits(withSpeed)[0].laps).toHaveLength(2);
  });

  it("rejects a run whose lap times do not sum to its cumulative times", () => {
    const broken = "1,250,16.26,16.26\n1,500,32.69,17.43\n";
    expect(() => parseLapSplits(broken)).toThrow(SplitParseError);
    expect(() => parseLapSplits(broken)).toThrow(
      /Run 1 does not reconcile.*lap 2/s
    );
  });

  it("names the run and the size of the discrepancy", () => {
    const broken = "5,250,16.26,16.26\n5,500,33.69,16.43\n";
    expect(() => parseLapSplits(broken)).toThrow(/Run 5/);
    expect(() => parseLapSplits(broken)).toThrow(/1\.00 s/);
  });

  it("accepts rounding drift within tolerance", () => {
    // Two-decimal lap times sum to 32.68 against a cumulative column of 32.69.
    const rounded = "1,250,16.26,16.26\n1,500,32.69,16.42\n";
    expect(() => parseLapSplits(rounded)).not.toThrow();
  });

  it("rejects distances that do not advance by the lap length", () => {
    const broken = "1,250,16.26,16.26\n1,600,32.69,16.43\n";
    expect(() => parseLapSplits(broken)).toThrow(/600 m where 250 m laps give/);
  });

  it("accepts a track that is not 250 m", () => {
    const long = "1,333.33,21.7,21.7\n1,666.66,43.3,21.6\n1,999.99,65.0,21.7\n";
    const runs = parseLapSplits(long, 333.33);
    expect(runs[0].laps).toHaveLength(3);
    expect(runs[0].distanceMeters).toBeCloseTo(999.99, 2);
  });

  it("rejects a non-numeric cell by line and column", () => {
    expect(() => parseLapSplits("1,250,x,16.26\n1,500,32.69,16.43\n")).toThrow(
      /Line 1 .* "x" where a cumulative time was expected/
    );
  });

  it("rejects a run with a single lap", () => {
    expect(() => parseLapSplits("1,250,16.26,16.26\n")).toThrow(
      /at least two are needed/
    );
  });

  it("rejects an empty record", () => {
    expect(() => parseLapSplits("   \n\n")).toThrow(/empty/);
  });
});

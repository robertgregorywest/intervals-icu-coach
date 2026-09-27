/**
 * Handing a record's splits back in the inline form the alignment parses. The
 * round trip is the point: what comes out must parse back to the same runs, or
 * `sessionId` would be a quieter way to mistype the export.
 */

import { describe, it, expect } from "vitest";
import { fileURLToPath } from "node:url";
import { loadTrackSessionRecords } from "../../../../src/services/track/records/loader.js";
import { serializeSplits } from "../../../../src/services/track/records/splits-source.js";
import { parseLapSplits } from "../../../../src/services/track/alignment/splits.js";

const FIXTURES = fileURLToPath(
  new URL("../../../fixtures/track-sessions", import.meta.url)
);

const { records } = loadTrackSessionRecords(FIXTURES);
const find = (id: string) => records.find((r) => r.basis.id === id)!;

describe("serializeSplits", () => {
  it("round-trips through the parser to the same runs", () => {
    const record = find("2026-07-12-training");
    const reparsed = parseLapSplits(serializeSplits(record), 250);
    expect(reparsed).toEqual(record.runs);
  });

  it("writes a header row and one row per lap, in export order", () => {
    const record = find("2026-nationals-ip");
    const lines = serializeSplits(record).split("\n");
    expect(lines[0]).toBe("run,cumDist,cumTime,lap");
    expect(lines).toHaveLength(1 + 8);
    expect(lines[1]).toBe("race,250,23.21,23.21");
  });
});

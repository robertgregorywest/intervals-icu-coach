import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createFitCodec } from "../../../src/services/fit/index.js";

const fit = createFitCodec();

/**
 * Real bytes from the Wahoo ELEMNT BOLT that recorded the 2026-08-06 pursuit
 * session, reduced to its file_id and lap records — the definition messages and
 * data records are copied verbatim, so field layout, endianness and scaling are
 * the device's own. Decoding the trimmed file was verified to give byte-for-byte
 * the same laps as decoding the full 184 KB upload.
 */
function realFitFile(): Uint8Array {
  const path = fileURLToPath(
    new URL(
      "../../fixtures/session-review/pursuit-race-pace.fit",
      import.meta.url
    )
  );
  return new Uint8Array(readFileSync(path));
}

/** The laps as the device wrote them, cross-checked against the `fitparse` reference decoder. */
const EXPECTED: Array<[number, number]> = [
  [903, 169], // warm-up
  [30, 352],
  [60, 119],
  [30, 389],
  [60, 111],
  [30, 367],
  [60, 142],
  [240, 100], // settle
  [150, 396], // rep 1
  [300, 99],
  [150, 393], // rep 2
  [300, 115],
  [150, 346], // rep 3 — the fade
  [300, 73],
  [149, 350], // rep 4
  [325, 98],
  [1127, 117], // ride home
];

describe("decodeLaps", () => {
  it("reads every lap the device recorded", () => {
    const laps = fit.decodeLaps(realFitFile());

    expect(laps).not.toBeNull();
    expect(laps!.map((l) => [l.durationSeconds, l.averageWatts])).toEqual(
      EXPECTED
    );
  });

  it("anchors start times at the first lap and keeps them contiguous", () => {
    const laps = fit.decodeLaps(realFitFile())!;

    expect(laps[0].startTimeSeconds).toBe(0);
    // Laps abut: each starts where the previous one's elapsed time ended.
    let cursor = 0;
    for (const lap of laps) {
      expect(lap.startTimeSeconds).toBe(cursor);
      cursor += lap.durationSeconds;
    }
  });

  it("carries cadence and heart rate through", () => {
    const laps = fit.decodeLaps(realFitFile())!;

    expect(laps[8].averageHeartrate).toBe(142);
    expect(laps[8].averageCadence).toBe(88);
    expect(laps[8].maxWatts).toBe(446);
  });

  it("carries normalized power and distance, scaling distance to metres", () => {
    const laps = fit.decodeLaps(realFitFile())!;

    expect(laps[0].normalizedWatts).toBe(177);
    expect(laps[0].distanceMeters).toBe(7451.27);
  });

  it("distinguishes elapsed from timer time on a paused lap", () => {
    const laps = fit.decodeLaps(realFitFile())!;

    // Lap 15 was paused mid-recovery: 325s of wall clock, 301s of timer.
    expect(laps[15].durationSeconds).toBe(325);
    expect(laps[15].timerSeconds).toBe(301);
  });

  it("returns null rather than throwing on bytes that are not a FIT file", () => {
    expect(fit.decodeLaps(new Uint8Array(0))).toBeNull();
    expect(fit.decodeLaps(new Uint8Array(64))).toBeNull();
    expect(
      fit.decodeLaps(new TextEncoder().encode("<html>not a fit file</html>"))
    ).toBeNull();
  });

  it("returns null on a FIT file whose record stream is truncated mid-header", () => {
    const truncated = realFitFile().slice(0, 20);

    expect(fit.decodeLaps(truncated)).toBeNull();
  });

  it("returns an empty list for a valid FIT file carrying no laps", () => {
    const bytes = realFitFile();
    // Keep the header, declare an empty record stream.
    const empty = bytes.slice(0, 14);
    new DataView(empty.buffer, empty.byteOffset).setUint32(4, 0, true);

    expect(fit.decodeLaps(empty)).toEqual([]);
  });
});

import { describe, it, expect } from "vitest";
import {
  inMiddleBand,
  middleBandBounds,
  middleBandSeconds,
} from "../../src/shared/middle-band.js";

/** 76–106% of FTP 290. */
const BOUNDS = { lowW: 220, highW: 307 };

describe("middleBandBounds", () => {
  it("is 76–106% of FTP, to the watt", () => {
    expect(middleBandBounds(290)).toEqual(BOUNDS);
    expect(middleBandBounds(250)).toEqual({ lowW: 190, highW: 265 });
  });
});

describe("inMiddleBand", () => {
  it("includes both edges and nothing past them", () => {
    expect(inMiddleBand(220, BOUNDS)).toBe(true);
    expect(inMiddleBand(307, BOUNDS)).toBe(true);
    expect(inMiddleBand(219, BOUNDS)).toBe(false);
    expect(inMiddleBand(308, BOUNDS)).toBe(false);
  });
});

describe("middleBandSeconds", () => {
  it("counts one second per sample in the band, out of every sample with power", () => {
    expect(middleBandSeconds([150, 220, 260, 307, 400], BOUNDS)).toEqual({
      bandSeconds: 3,
      powerSeconds: 5,
    });
  });

  it("counts a dropout as neither band nor power time", () => {
    expect(
      middleBandSeconds([260, null, undefined, Number.NaN, 150], BOUNDS)
    ).toEqual({ bandSeconds: 1, powerSeconds: 2 });
  });

  it("counts an empty stream as zero", () => {
    expect(middleBandSeconds([], BOUNDS)).toEqual({
      bandSeconds: 0,
      powerSeconds: 0,
    });
  });
});

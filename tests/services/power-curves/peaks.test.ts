import { describe, it, expect } from "vitest";
import { extractPeaks } from "../../../src/services/power-curves/index.js";

const CURVE_ENVELOPE = {
  list: [
    {
      secs: [5, 30, 60, 120, 300, 1200],
      watts: [1050, 800, 540, 450, 370, 280],
      values: [1050, 800, 540, 450, 370, 280],
    },
  ],
};

describe("extractPeaks", () => {
  it("reads parallel-array envelope shape", () => {
    expect(extractPeaks(CURVE_ENVELOPE)).toEqual({
      p5s: 1050,
      p60: 540,
      p5min: 370,
    });
  });

  it("reads flat array of points shape", () => {
    const points = [
      { secs: 5, value: 1000 },
      { secs: 60, value: 500 },
      { secs: 300, value: 360 },
      { secs: 1200, value: 270 },
    ];
    expect(extractPeaks(points)).toEqual({
      p5s: 1000,
      p60: 500,
      p5min: 360,
    });
  });

  it("returns nulls for unrecognised shape", () => {
    expect(extractPeaks(null)).toEqual({
      p5s: null,
      p60: null,
      p5min: null,
    });
    expect(extractPeaks({ foo: "bar" })).toEqual({
      p5s: null,
      p60: null,
      p5min: null,
    });
  });
});

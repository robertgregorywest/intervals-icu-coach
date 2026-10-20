import { describe, it, expect } from "vitest";
import { round } from "../../src/shared/round.js";

describe("round", () => {
  it("strips the float noise a sum of two-decimal values leaves", () => {
    const laps = [16.26, 16.43, 15.98, 15.87, 15.96, 16.02, 15.69];
    expect(round(0.1 + 0.2, 2)).toBe(0.3);
    expect(
      round(
        laps.reduce((a, b) => a + b),
        2
      )
    ).toBe(112.21);
  });

  // Both sit a float-ulp below their own half-way point: a bare Math.round
  // gives 16.86 and 1.00.
  it("rounds a value stored just under its half-way point up, as written", () => {
    expect(round(16.865, 2)).toBe(16.87);
    expect(round(1.005, 2)).toBe(1.01);
  });

  it("rounds to the decimals asked for", () => {
    expect(round(226.4917, 0)).toBe(226);
    expect(round(0.79192902, 3)).toBe(0.792);
  });

  it("passes undefined through", () => {
    expect(round(undefined, 2)).toBeUndefined();
  });
});

import { describe, it, expect } from "vitest";
import { computeBestPower, normalizedPower } from "../../src/shared/power.js";

describe("computeBestPower", () => {
  it("finds best power over a sliding window", () => {
    const stream = [100, 150, 200, 250, 300, 200, 100];
    const result = computeBestPower(stream, 3);

    expect(result).not.toBeNull();
    expect(result!.bestPower).toBe(250); // (200+250+300)/3
    expect(result!.startIndex).toBe(2);
  });

  it("returns null if duration exceeds stream length", () => {
    const result = computeBestPower([100, 200], 5);
    expect(result).toBeNull();
  });

  it("handles single-second duration", () => {
    const stream = [100, 300, 200];
    const result = computeBestPower(stream, 1);

    expect(result!.bestPower).toBe(300);
    expect(result!.startIndex).toBe(1);
  });

  it("handles uniform power", () => {
    const stream = Array(60).fill(200);
    const result = computeBestPower(stream, 30);

    expect(result!.bestPower).toBe(200);
  });
});

describe("normalizedPower", () => {
  it("expands the rolling mean over the first 30 seconds rather than skipping them", () => {
    // A 30-second stream has no full window at all. Skipping the partial ones
    // would leave nothing to average and lose the session entirely.
    const np = normalizedPower(Array.from({ length: 30 }, () => 200));
    expect(np).toBeCloseTo(200, 6);
  });

  it("returns undefined for an empty stream", () => {
    expect(normalizedPower([])).toBeUndefined();
  });
});

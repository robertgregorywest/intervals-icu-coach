import { describe, it, expect } from "vitest";
import { snapRun } from "../../../../src/services/track/writeback/snap.js";

const oneHz = Array.from({ length: 200 }, (_, i) => i);

describe("snapRun", () => {
  it("snaps each boundary to the nearer sample and signs the drift", () => {
    const { start, end } = snapRun(oneHz, 26.68, 140.94, 1);

    expect(start.index).toBe(27);
    expect(start.driftSeconds).toBeCloseTo(0.32, 3);
    expect(end.index).toBe(141);
    expect(end.driftSeconds).toBeCloseTo(0.06, 3);
  });

  it("snaps backwards when the sample before is nearer", () => {
    const { start } = snapRun(oneHz, 26.2, 100, 1);

    expect(start.index).toBe(26);
    expect(start.driftSeconds).toBeCloseTo(-0.2, 3);
  });

  it("keeps the end exclusive, so a boundary index may sit one past the last sample", () => {
    const { end } = snapRun(oneHz, 10, 199.8, 1);

    expect(end.index).toBe(200);
    expect(end.seconds).toBe(200);
  });

  it("never produces a zero-width interval", () => {
    const { start, end } = snapRun(oneHz, 50.1, 50.2, 1);

    expect(end.index).toBeGreaterThan(start.index);
  });

  it("uses the recording's own time base, not sample position", () => {
    // A 5 s recording: sample 4 sits at t=20, not t=4.
    const fiveSecond = [0, 5, 10, 15, 20, 25];
    const { start, end } = snapRun(fiveSecond, 9, 21, 5);

    expect(start.index).toBe(2);
    expect(start.seconds).toBe(10);
    expect(start.driftSeconds).toBeCloseTo(1, 3);
    expect(end.index).toBe(4);
    expect(end.seconds).toBe(20);
  });
});

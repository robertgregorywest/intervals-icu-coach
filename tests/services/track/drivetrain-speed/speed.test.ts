import { describe, it, expect } from "vitest";
import type { FitRecord } from "../../../../src/services/fit/index.js";
import {
  computeDrivetrainSpeed,
  distanceOver,
} from "../../../../src/services/track/drivetrain-speed/speed.js";

/** 65x16 on a 2099 mm rollout. */
const DEV_110 = (65 / 16) * 2.099;

function records(
  cadences: Array<number | null>,
  times?: number[]
): FitRecord[] {
  return cadences.map((cadence, i) => ({
    timestamp: 1000 + (times ? times[i] : i),
    cadence,
    speed: null,
    distance: null,
  }));
}

describe("computeDrivetrainSpeed", () => {
  it("is true development × cadence ÷ 60, with distance covered before each sample", () => {
    const stream = computeDrivetrainSpeed(records([120, 120, 60]), DEV_110);
    expect(stream.values[0].speed).toBeCloseTo(DEV_110 * 2, 9);
    expect(stream.values[2].speed).toBeCloseTo(DEV_110, 9);
    expect(stream.values.map((v) => v.distance)).toEqual([
      0,
      DEV_110 * 2,
      DEV_110 * 4,
    ]);
  });

  it("makes no claim where cadence is missing, and carries distance over it", () => {
    const stream = computeDrivetrainSpeed(records([60, null, 60]), DEV_110);
    expect(stream.values[1].speed).toBeNull();
    expect(stream.values[2].distance).toBeCloseTo(DEV_110, 9);
    expect(stream.counts.missingCadence).toBe(1);
  });

  it("claims no speed at cadence 0 — rolling without torque reads the same as stopped", () => {
    const stream = computeDrivetrainSpeed(records([60, 0, 0, 60]), DEV_110);
    expect(stream.values.map((v) => v.speed === null)).toEqual([
      false,
      true,
      true,
      false,
    ]);
    expect(stream.values[3].distance).toBeCloseTo(DEV_110, 9);
    expect(stream.counts).toMatchObject({ zeroCadence: 2, withSpeed: 2 });
  });

  it("adds no distance across a pause, beyond one sampling interval", () => {
    const stream = computeDrivetrainSpeed(
      records([60, 60, 60, 60], [0, 1, 2, 302]),
      DEV_110
    );
    expect(stream.values[3].distance).toBeCloseTo(DEV_110 * 3, 9);
    expect(stream.counts).toMatchObject({ pauses: 1, pausedSeconds: 299 });
  });

  it("counts a dropped sample or two as riding, not a pause", () => {
    const stream = computeDrivetrainSpeed(
      records([60, 60, 60, 60, 60], [0, 1, 2, 4, 5]),
      DEV_110
    );
    expect(stream.values[3].distance).toBeCloseTo(DEV_110 * 4, 9);
    expect(stream.counts.pauses).toBe(0);
  });

  it("writes speed only inside the on-track ranges", () => {
    const stream = computeDrivetrainSpeed(records([60, 60, 60, 60]), DEV_110, [
      { startSeconds: 1, endSeconds: 3 },
    ]);
    expect(stream.values.map((v) => v.speed !== null)).toEqual([
      false,
      true,
      true,
      false,
    ]);
    expect(stream.counts.outsideOnTrack).toBe(2);
  });

  it("integrates a window by overlap, so a lap boundary can fall mid-sample", () => {
    const stream = computeDrivetrainSpeed(records([60, 120, 60]), DEV_110);
    expect(distanceOver(stream, 0.5, 1.5)).toBeCloseTo(
      DEV_110 * 0.5 + DEV_110 * 2 * 0.5,
      9
    );
  });
});

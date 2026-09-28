import { describe, it, expect, vi } from "vitest";
import { createDrivetrainSpeedFitTool } from "../../src/tools/drivetrain-speed.js";
import type { IServices } from "../../src/index.js";

const createDrivetrainSpeedFit = createDrivetrainSpeedFitTool.handler;
const schema = createDrivetrainSpeedFitTool.schema;
const outputSchema = createDrivetrainSpeedFitTool.outputSchema;

const result = {
  activityId: "i164949895",
  outputPath: "/tmp/out.fit",
  development: {
    meters: 8.527,
    gear: "65x16",
    rolloutMm: 2099,
    source: "gear",
  },
  recording: {
    records: 158,
    withSpeed: 150,
    missingCadence: 0,
    zeroCadence: 8,
    outsideOnTrack: 0,
    pauses: 0,
    pausedSeconds: 0,
    samplingIntervalSeconds: 1,
  },
  totals: { distanceMeters: 1500, maxSpeedMetersPerSecond: 18.5 },
};

function clientWith(spy = vi.fn().mockResolvedValue(result)) {
  return {
    services: { track: { drivetrainSpeed: spy } } as unknown as IServices,
    spy,
  };
}

describe("create_drivetrain_speed_fit handler", () => {
  it("passes the arguments through to the track service", async () => {
    const { services, spy } = clientWith();
    const args = {
      activityId: "i164949895",
      gear: "65x16",
      outputPath: "/tmp/out.fit",
    };

    const out = await createDrivetrainSpeedFit(services, args);

    expect(spy).toHaveBeenCalledWith(args);
    expect(out).toBe(result);
  });

  it("returns a result its own output schema accepts", async () => {
    const { services } = clientWith();
    const out = await createDrivetrainSpeedFit(services, {
      activityId: 164949895,
      gear: "65x16",
    });
    expect(outputSchema.safeParse(out).success).toBe(true);
  });

  it("accepts a numeric activity ID and rejects a non-positive rollout", () => {
    expect(schema.safeParse({ activityId: 164949895 }).success).toBe(true);
    expect(schema.safeParse({ gear: "65x16", rolloutMm: 0 }).success).toBe(
      false
    );
  });
});

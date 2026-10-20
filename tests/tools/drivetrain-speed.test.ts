import { describe, it, expect, vi } from "vitest";
import { createDrivetrainSpeedFitTool } from "../../src/tools/drivetrain-speed.js";
import type { IServices } from "../../src/index.js";

const createDrivetrainSpeedFit = createDrivetrainSpeedFitTool.handler;
const schema = createDrivetrainSpeedFitTool.schema;

function clientWith(spy = vi.fn().mockResolvedValue({})) {
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

    await createDrivetrainSpeedFit(services, args);

    expect(spy).toHaveBeenCalledWith(args);
  });

  it("accepts a numeric activity ID and rejects a non-positive rollout", () => {
    expect(schema.safeParse({ activityId: 164949895 }).success).toBe(true);
    expect(schema.safeParse({ gear: "65x16", rolloutMm: 0 }).success).toBe(
      false
    );
  });
});

import { describe, it, expect, vi } from "vitest";
import { computePowerProfileTool } from "../../src/tools/power-profile.js";
import type { IServices } from "../../src/index.js";

describe("compute_power_profile handler", () => {
  it("passes the overrides through to the service", async () => {
    const spy = vi.fn().mockResolvedValue({});
    const services = {
      powerProfile: { computePowerProfile: spy },
    } as unknown as IServices;
    const args = { ftpWatts: 300, sex: "male" as const, p5s: 1100 };

    await computePowerProfileTool.handler(services, args);

    expect(spy).toHaveBeenCalledWith(args);
  });

  it("rejects a non-positive override and an unknown sex", () => {
    const schema = computePowerProfileTool.schema;
    expect(schema.safeParse({ ftpWatts: 0 }).success).toBe(false);
    expect(schema.safeParse({ sex: "other" }).success).toBe(false);
  });
});

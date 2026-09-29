import { describe, it, expect, vi } from "vitest";
import {
  getAerobicDecouplingTool,
  compareIntervalsTool,
} from "../../src/tools/analysis.js";
import type { IServices } from "../../src/index.js";

function createMockServices(): IServices {
  const analysis = {
    getAerobicDecoupling: vi.fn().mockResolvedValue({
      firstHalf: { avgPower: 200, avgHR: 140, hrPowerRatio: 0.7 },
      secondHalf: { avgPower: 200, avgHR: 150, hrPowerRatio: 0.75 },
      decouplingPercent: 7.14,
      interpretation: "Moderate decoupling — aerobic endurance developing",
    }),
    compareIntervals: vi.fn().mockResolvedValue({
      intervals: [
        {
          lapNumber: 1,
          values: [{ activityId: 1, avg_watts: 300 }],
        },
      ],
      summaries: [{ activityId: 1, intervalCount: 1, avgPower: 300 }],
    }),
  };
  return { analysis } as unknown as IServices;
}

describe("getAerobicDecoupling tool handler", () => {
  it("returns decoupling analysis as JSON", async () => {
    const services = createMockServices();
    const result = await getAerobicDecouplingTool.handler(services, {
      activityId: "i42",
    });
    const parsed = result;

    expect(parsed.decouplingPercent).toBe(7.14);
    expect(parsed.interpretation).toContain("Moderate");
    expect(services.analysis.getAerobicDecoupling).toHaveBeenCalledWith("i42");
  });

  it("normalizes bare number to i-prefixed string", async () => {
    const services = createMockServices();
    await getAerobicDecouplingTool.handler(
      services,
      getAerobicDecouplingTool.schema.parse({ activityId: 42 })
    );
    expect(services.analysis.getAerobicDecoupling).toHaveBeenCalledWith("i42");
  });
});

describe("compare_intervals tool handler", () => {
  it("returns interval comparison as JSON", async () => {
    const services = createMockServices();
    const result = await compareIntervalsTool.handler(services, {
      activityIds: ["i1", "i2"],
      minPower: 200,
    });
    const parsed = result;

    expect(parsed.intervals).toHaveLength(1);
    expect(parsed.summaries).toHaveLength(1);
    expect(services.analysis.compareIntervals).toHaveBeenCalledWith(
      ["i1", "i2"],
      {
        minPower: 200,
        targetDuration: undefined,
        durationTolerance: undefined,
      }
    );
  });

  it("normalizes bare numbers in activityIds", async () => {
    const services = createMockServices();
    await compareIntervalsTool.handler(
      services,
      compareIntervalsTool.schema.parse({ activityIds: [1, 2] })
    );
    expect(services.analysis.compareIntervals).toHaveBeenCalledWith(
      ["i1", "i2"],
      expect.any(Object)
    );
  });
});

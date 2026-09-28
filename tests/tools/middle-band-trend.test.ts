import { describe, it, expect, vi } from "vitest";
import { getMiddleBandTrendTool } from "../../src/tools/middle-band-trend.js";
import type { IServices } from "../../src/index.js";
import type { MiddleBandTrendResult } from "../../src/services/training-load/index.js";

const RESULT: MiddleBandTrendResult = {
  oldest: "2026-08-03",
  newest: "2026-08-16",
  sport: null,
  band: { lowPctFtp: 76, highPctFtp: 106 },
  weeks: [
    {
      weekStart: "2026-08-03",
      weekEnd: "2026-08-09",
      seconds: 1800,
      hours: 0.5,
      fractionOfPowerTime: 0.667,
      ftpRange: { min: 280, max: 300 },
      note: "The week spans an FTP change (280-300 W); each ride was measured against its own FTP.",
      excludedNoFtp: 0,
      rides: 2,
    },
    {
      weekStart: "2026-08-10",
      weekEnd: "2026-08-16",
      seconds: 0,
      hours: 0,
      fractionOfPowerTime: null,
      ftpRange: null,
      excludedNoFtp: 0,
      rides: 0,
    },
  ],
  total: {
    seconds: 1800,
    hours: 0.5,
    fractionOfPowerTime: 0.667,
    ftpRange: { min: 280, max: 300 },
    excludedNoFtp: 0,
    rides: 2,
  },
};

const schema = getMiddleBandTrendTool.schema;

function stubServices() {
  const trainingLoad = { getMiddleBandTrend: vi.fn(async () => RESULT) };
  return { trainingLoad } as unknown as IServices & {
    trainingLoad: typeof trainingLoad;
  };
}

describe("get_middle_band_trend tool", () => {
  it("passes the range and sport straight through", async () => {
    const services = stubServices();
    await getMiddleBandTrendTool.handler(services, {
      oldest: "2026-08-05",
      newest: "2026-08-12",
      sport: "Ride",
    });
    expect(services.trainingLoad.getMiddleBandTrend).toHaveBeenCalledWith({
      oldest: "2026-08-05",
      newest: "2026-08-12",
      sport: "Ride",
    });
  });

  it("returns a payload its own output schema accepts", async () => {
    const out = await getMiddleBandTrendTool.handler(stubServices(), {
      oldest: "2026-08-03",
      newest: "2026-08-16",
    });
    expect(() => getMiddleBandTrendTool.outputSchema.parse(out)).not.toThrow();
  });

  it("states the range cap in the schema", () => {
    expect(schema.shape.oldest.description).toMatch(/at most 16/);
    expect(schema.shape.newest.description).toMatch(/At most 16 weeks/);
  });

  it("rejects a malformed date and an unknown sport at the schema", () => {
    expect(() =>
      schema.parse({ oldest: "03-08-2026", newest: "2026-08-16" })
    ).toThrow();
    expect(() =>
      schema.parse({
        oldest: "2026-08-03",
        newest: "2026-08-16",
        sport: "Cycling",
      })
    ).toThrow();
  });
});

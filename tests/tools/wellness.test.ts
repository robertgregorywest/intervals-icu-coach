import { describe, it, expect, vi } from "vitest";
import {
  getWellnessTool,
  getFitnessSummaryTool,
} from "../../src/tools/wellness.js";
import type { IServices } from "../../src/index.js";

function createMockServices(): IServices {
  return {
    wellness: {
      getWellness: vi
        .fn()
        .mockResolvedValue([{ date: "2024-01-01", ctl: 60, atl: 70 }]),
      getWellnessDay: vi.fn().mockResolvedValue({
        date: "2024-01-15",
        ctl: 62,
        atl: 55,
      }),
    },
    today: () => "2024-01-15",
  } as unknown as IServices;
}

describe("getWellness tool handler", () => {
  it("returns wellness data as JSON", async () => {
    const services = createMockServices();
    const result = await getWellnessTool.handler(services, {
      oldest: "2024-01-01",
      newest: "2024-01-31",
    });
    const parsed = result;

    expect(parsed.total).toBe(1);
    expect(parsed.count).toBe(1);
    expect(parsed.truncated).toBe(false);
    expect(parsed.records[0].ctl).toBe(60);
  });
});

describe("getFitnessSummary tool handler", () => {
  it("returns today's fitness snapshot", async () => {
    const services = createMockServices();
    const parsed = (await getFitnessSummaryTool.handler(
      services,
      {}
    )) as Record<string, unknown>;

    expect(parsed.ctl).toBe(62);
    expect(services.wellness.getWellnessDay).toHaveBeenCalledWith("2024-01-15");
  });
});

import { describe, it, expect, vi } from "vitest";
import {
  getWellnessTool,
  getFitnessSummaryTool,
} from "../../src/tools/wellness.js";
import type { IIntervalsClient } from "../../src/index.js";

function createMockClient(): IIntervalsClient {
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
  } as unknown as IIntervalsClient;
}

describe("getWellness tool handler", () => {
  it("returns wellness data as JSON", async () => {
    const client = createMockClient();
    const result = await getWellnessTool.handler(client, {
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
    const client = createMockClient();
    const parsed = (await getFitnessSummaryTool.handler(client, {})) as Record<
      string,
      unknown
    >;

    expect(parsed.ctl).toBe(62);
    expect(client.wellness.getWellnessDay).toHaveBeenCalledWith("2024-01-15");
  });
});

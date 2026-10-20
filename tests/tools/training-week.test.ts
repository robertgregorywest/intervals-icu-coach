import { describe, it, expect, vi } from "vitest";
import { getTrainingWeekSummaryTool } from "../../src/tools/training-week.js";
import type { IServices } from "../../src/index.js";

function servicesWith(summarizeWeek = vi.fn().mockResolvedValue({})) {
  return {
    services: { trainingLoad: { summarizeWeek } } as unknown as IServices,
    summarizeWeek,
  };
}

describe("getTrainingWeekSummary tool handler", () => {
  it("delegates to the service with the given weekStart", async () => {
    const { services, summarizeWeek } = servicesWith();

    await getTrainingWeekSummaryTool.handler(services, {
      weekStart: "2026-04-27",
    });

    expect(summarizeWeek).toHaveBeenCalledWith("2026-04-27");
  });

  it("passes undefined through when weekStart is omitted", async () => {
    const { services, summarizeWeek } = servicesWith();

    await getTrainingWeekSummaryTool.handler(services, {});

    expect(summarizeWeek).toHaveBeenCalledWith(undefined);
  });
});

import { describe, it, expect, vi } from "vitest";
import { createActivityAnalysis } from "../../../src/services/analysis/index.js";
import type { IActivitiesApi } from "../../../src/services/activities/index.js";

function analysisOver(api: Partial<IActivitiesApi>) {
  return createActivityAnalysis({
    activitiesApi: api as IActivitiesApi,
  });
}

describe("createActivityAnalysis", () => {
  it("reads only power and heart rate for decoupling", async () => {
    const getActivityStreams = vi.fn().mockResolvedValue({
      watts: [200, 200, 200, 200],
      heartrate: [140, 140, 150, 150],
    });
    const result = await analysisOver({
      getActivityStreams,
    }).getAerobicDecoupling("i1");

    expect(getActivityStreams).toHaveBeenCalledWith("i1", [
      "watts",
      "heartrate",
    ]);
    expect(result.decouplingPercent).toBeGreaterThan(0);
  });

  it("refuses decoupling without power", async () => {
    const analysis = analysisOver({
      getActivityStreams: vi.fn().mockResolvedValue({ heartrate: [140] }),
    });
    await expect(analysis.getAerobicDecoupling("i1")).rejects.toThrow(
      /No power data/
    );
  });

  it("refuses decoupling without heart rate", async () => {
    const analysis = analysisOver({
      getActivityStreams: vi.fn().mockResolvedValue({ watts: [200] }),
    });
    await expect(analysis.getAerobicDecoupling("i1")).rejects.toThrow(
      /No heart rate data/
    );
  });

  it("fetches each activity with its intervals to compare them", async () => {
    const getActivity = vi.fn(async (id: string) => ({
      id,
      icu_intervals: [],
    }));
    const result = await analysisOver({
      getActivity: getActivity as unknown as IActivitiesApi["getActivity"],
    }).compareIntervals(["i1", "i2"]);

    expect(getActivity.mock.calls).toEqual([
      ["i1", true],
      ["i2", true],
    ]);
    expect(result.summaries).toHaveLength(2);
  });
});

import { describe, it, expect, vi } from "vitest";
import { compareIntensityDistributionTool } from "../../src/tools/intensity-distribution.js";
import type { IIntervalsClient } from "../../src/index.js";
import {
  createExecutionReview,
  type IntensityDistributionRangeResult,
  type IntensityDistributionResult,
} from "../../src/services/execution-review/index.js";
import {
  intervalsApis,
  requested,
  routedFetch,
} from "../helpers/intervals-fixture.js";

const compareIntensityDistribution = compareIntensityDistributionTool.handler;
const compareIntensityDistributionOutputSchema =
  compareIntensityDistributionTool.outputSchema;

const single: IntensityDistributionResult = {
  activityId: "i170317118",
  eventId: 123780516,
  plannedTotalSeconds: 4200,
  deliveredTotalSeconds: 4112,
  unbucketedSteps: [],
  boundarySpanningSteps: [],
  boundaries: [{ name: "L3", lowW: 249, highW: 270, coachingHighW: 291 }],
  zones: [
    {
      zone: "L3",
      lowW: 249,
      highW: 270,
      plannedSeconds: 2160,
      deliveredSeconds: 723,
      deltaSeconds: -1437,
    },
  ],
  middleBand: {
    lowW: 220,
    highW: 307,
    lowPctFtp: 76,
    highPctFtp: 106,
    plannedSeconds: 2160,
    deliveredSeconds: 2033,
    deltaSeconds: -127,
    deliveredFraction: 0.941,
  },
};

const range: IntensityDistributionRangeResult = {
  oldest: "2026-07-21",
  newest: "2026-08-03",
  sessions: [],
  excluded: [],
};

function clientWith() {
  const one = vi.fn().mockResolvedValue(single);
  const many = vi.fn().mockResolvedValue(range);
  return {
    client: {
      executionReview: {
        compareIntensityDistribution: one,
        compareIntensityDistributionRange: many,
      },
    } as unknown as IIntervalsClient,
    one,
    many,
  };
}

/** The real service over a fetch that answers nothing. */
function realClient() {
  const fetchFn = routedFetch([]);
  const client = {
    executionReview: createExecutionReview(intervalsApis(fetchFn)),
  } as unknown as IIntervalsClient;
  return { client, fetchFn };
}

describe("compare_intensity_distribution handler", () => {
  it("rejects both identifiers before making any request", async () => {
    const { client, fetchFn } = realClient();

    await expect(
      compareIntensityDistribution(client, { activityId: "i1", eventId: 2 })
    ).rejects.toThrow(/exactly one/);
    expect(requested(fetchFn)).toEqual([]);
  });

  it("rejects neither identifier nor range", async () => {
    const { client, fetchFn } = realClient();

    await expect(compareIntensityDistribution(client, {})).rejects.toThrow(
      /exactly one/
    );
    expect(requested(fetchFn)).toEqual([]);
  });

  it("rejects mixing a session with a range", async () => {
    const { client, one, many } = clientWith();

    await expect(
      compareIntensityDistribution(client, {
        activityId: "i1",
        oldest: "2026-07-21",
        newest: "2026-08-03",
      })
    ).rejects.toThrow(/not both/);
    expect(one).not.toHaveBeenCalled();
    expect(many).not.toHaveBeenCalled();
  });

  it("rejects a half-supplied range", async () => {
    const { client, many } = clientWith();

    await expect(
      compareIntensityDistribution(client, { oldest: "2026-07-21" })
    ).rejects.toThrow(/both oldest and newest/);
    expect(many).not.toHaveBeenCalled();
  });

  it("passes a single activityId through", async () => {
    const { client, one } = clientWith();

    await compareIntensityDistribution(client, { activityId: "i170317118" });

    expect(one).toHaveBeenCalledWith({
      activityId: "i170317118",
      eventId: undefined,
    });
  });

  it("prefixes a bare numeric activity ID", async () => {
    const { client, one } = clientWith();

    await compareIntensityDistribution(client, { activityId: 170317118 });

    expect(one).toHaveBeenCalledWith({
      activityId: "i170317118",
      eventId: undefined,
    });
  });

  it("routes a range to the aggregate", async () => {
    const { client, one, many } = clientWith();

    await compareIntensityDistribution(client, {
      oldest: "2026-07-21",
      newest: "2026-08-03",
    });

    expect(many).toHaveBeenCalledWith({
      oldest: "2026-07-21",
      newest: "2026-08-03",
    });
    expect(one).not.toHaveBeenCalled();
  });
});

describe("compare_intensity_distribution output schema", () => {
  it("accepts a single-session result", () => {
    expect(() =>
      compareIntensityDistributionOutputSchema.parse(single)
    ).not.toThrow();
  });

  it("accepts a range result", () => {
    expect(() =>
      compareIntensityDistributionOutputSchema.parse(range)
    ).not.toThrow();
  });

  it("accepts a refusal, which carries a reason and no zones", () => {
    expect(() =>
      compareIntensityDistributionOutputSchema.parse({
        activityId: "i170871150",
        plannedTotalSeconds: 0,
        deliveredTotalSeconds: 0,
        unbucketedSteps: [],
        boundarySpanningSteps: [],
        reason: "no-recorded-power",
        message: "Activity i170871150 has no recorded power.",
      })
    ).not.toThrow();
  });
});

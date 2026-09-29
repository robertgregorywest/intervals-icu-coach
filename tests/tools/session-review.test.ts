import { describe, it, expect, vi } from "vitest";
import { comparePlannedVsActualTool } from "../../src/tools/session-review.js";
import type { IServices } from "../../src/index.js";
import {
  createExecutionReview,
  type PlannedVsActualResult,
} from "../../src/services/execution-review/index.js";
import {
  intervalsApis,
  requested,
  routedFetch,
} from "../helpers/intervals-fixture.js";

const comparePlannedVsActual = comparePlannedVsActualTool.handler;
const comparePlannedVsActualSchema = comparePlannedVsActualTool.schema;
const comparePlannedVsActualOutputSchema =
  comparePlannedVsActualTool.outputSchema;

const result: PlannedVsActualResult = {
  activityId: "i171371339",
  eventId: 123780543,
  tolerance: 0.05,
  alignmentBasis: "sequential",
  matchedFraction: 1,
  steps: [],
  rollup: { unplannedIntervals: [] },
};

function clientWith(spy = vi.fn().mockResolvedValue(result)) {
  return {
    services: {
      executionReview: { comparePlannedVsActual: spy },
    } as unknown as IServices,
    spy,
  };
}

/** The real service over a fetch that answers nothing. */
function realClient() {
  const fetchFn = routedFetch([]);
  const services = {
    executionReview: createExecutionReview(intervalsApis(fetchFn)),
  } as unknown as IServices;
  return { services, fetchFn };
}

describe("compare_planned_vs_actual handler", () => {
  it("rejects both identifiers before making any request", async () => {
    const { services, fetchFn } = realClient();

    await expect(
      comparePlannedVsActual(services, { activityId: "i1", eventId: 2 })
    ).rejects.toThrow(/exactly one/);
    expect(requested(fetchFn)).toEqual([]);
  });

  it("rejects neither identifier before making any request", async () => {
    const { services, fetchFn } = realClient();

    await expect(comparePlannedVsActual(services, {})).rejects.toThrow(
      /exactly one/
    );
    expect(requested(fetchFn)).toEqual([]);
  });

  it("passes a single activityId through", async () => {
    const { services, spy } = clientWith();

    await comparePlannedVsActual(services, { activityId: "i171371339" });

    expect(spy).toHaveBeenCalledWith({
      activityId: "i171371339",
      eventId: undefined,
      tolerance: undefined,
    });
  });

  it("prefixes a bare numeric activity ID", async () => {
    const { services, spy } = clientWith();

    await comparePlannedVsActual(
      services,
      comparePlannedVsActualTool.schema.parse({ activityId: 171371339 })
    );

    expect(spy).toHaveBeenCalledWith(
      expect.objectContaining({ activityId: "i171371339" })
    );
  });

  it("passes a single eventId through untouched", async () => {
    const { services, spy } = clientWith();

    await comparePlannedVsActual(services, { eventId: 123780543 });

    expect(spy).toHaveBeenCalledWith({
      activityId: undefined,
      eventId: 123780543,
      tolerance: undefined,
    });
  });

  it("passes tolerance through", async () => {
    const { services, spy } = clientWith();

    await comparePlannedVsActual(services, {
      activityId: "i171371339",
      tolerance: 0.12,
    });

    expect(spy).toHaveBeenCalledWith(
      expect.objectContaining({ tolerance: 0.12 })
    );
  });
});

describe("compare_planned_vs_actual schemas", () => {
  it("exposes a shape the MCP adapter can register", () => {
    expect(Object.keys(comparePlannedVsActualSchema.shape)).toEqual([
      "activityId",
      "eventId",
      "tolerance",
    ]);
  });

  it("rejects a tolerance outside (0, 1]", () => {
    expect(
      comparePlannedVsActualSchema.safeParse({ tolerance: 0 }).success
    ).toBe(false);
    expect(
      comparePlannedVsActualSchema.safeParse({ tolerance: 1.5 }).success
    ).toBe(false);
    expect(
      comparePlannedVsActualSchema.safeParse({ tolerance: 0.05 }).success
    ).toBe(true);
  });

  it("accepts a refusal result against the output schema", () => {
    const parsed = comparePlannedVsActualOutputSchema.safeParse({
      tolerance: 0.05,
      executionRecord: "detected-intervals",
      alignmentBasis: "none",
      matchedFraction: 0,
      steps: [],
      rollup: { plannedLoad: 73, actualLoad: 54, unplannedIntervals: [] },
      reason: "alignment-failed",
      message: "could not align",
    });

    expect(parsed.success).toBe(true);
  });
});

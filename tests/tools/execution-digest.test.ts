import { describe, it, expect, vi } from "vitest";
import { getExecutionDigestTool } from "../../src/tools/execution-digest.js";
import type { IServices } from "../../src/index.js";
import type { ExecutionDigestResult } from "../../src/services/execution-review/index.js";

const getExecutionDigest = getExecutionDigestTool.handler;
const schema = getExecutionDigestTool.schema;
const outputSchema = getExecutionDigestTool.outputSchema;

const skipped: ExecutionDigestResult = {
  oldest: "2026-09-01",
  newest: "2026-09-07",
  status: "skipped",
  message: "No key sessions in the window.",
  sessions: [],
  excluded: [],
  nonKeySessions: 2,
};

function clientWith(spy = vi.fn().mockResolvedValue(skipped)) {
  return {
    services: {
      executionReview: { getExecutionDigest: spy },
    } as unknown as IServices,
    spy,
  };
}

describe("get_execution_digest handler", () => {
  it("passes the window through to the service and returns its result", async () => {
    const { services, spy } = clientWith();

    const result = await getExecutionDigest(services, {
      oldest: "2026-09-01",
      newest: "2026-09-07",
    });

    expect(spy).toHaveBeenCalledWith({
      oldest: "2026-09-01",
      newest: "2026-09-07",
    });
    expect(result).toBe(skipped);
  });

  it("returns a result its own output schema accepts", async () => {
    const { services } = clientWith();
    const result = await getExecutionDigest(services, {
      oldest: "2026-09-01",
      newest: "2026-09-07",
    });
    expect(outputSchema.safeParse(result).success).toBe(true);
  });

  it("rejects a window that is not YYYY-MM-DD", () => {
    expect(
      schema.safeParse({ oldest: "1 Sep", newest: "2026-09-07" }).success
    ).toBe(false);
    expect(schema.safeParse({ oldest: "2026-09-01" }).success).toBe(false);
  });
});

import { describe, it, expect, vi } from "vitest";
import { getExecutionDigestTool } from "../../src/tools/execution-digest.js";
import type { IServices } from "../../src/index.js";
const getExecutionDigest = getExecutionDigestTool.handler;
const schema = getExecutionDigestTool.schema;

function clientWith(spy = vi.fn().mockResolvedValue({})) {
  return {
    services: {
      executionReview: { getExecutionDigest: spy },
    } as unknown as IServices,
    spy,
  };
}

describe("get_execution_digest handler", () => {
  it("passes the window through to the service", async () => {
    const { services, spy } = clientWith();

    await getExecutionDigest(services, {
      oldest: "2026-09-01",
      newest: "2026-09-07",
    });

    expect(spy).toHaveBeenCalledWith({
      oldest: "2026-09-01",
      newest: "2026-09-07",
    });
  });

  it("rejects a window that is not YYYY-MM-DD", () => {
    expect(
      schema.safeParse({ oldest: "1 Sep", newest: "2026-09-07" }).success
    ).toBe(false);
    expect(schema.safeParse({ oldest: "2026-09-01" }).success).toBe(false);
  });
});

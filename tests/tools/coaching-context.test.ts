import { describe, it, expect, vi } from "vitest";
import { getCoachingContextTool } from "../../src/tools/coaching-context.js";
import type { IServices } from "../../src/index.js";

const schema = getCoachingContextTool.schema;

describe("get_coaching_context handler", () => {
  it("passes days through to the service", async () => {
    const spy = vi.fn().mockResolvedValue({ asOf: "2026-09-28" });
    const services = {
      coachingContext: { getCoachingContext: spy },
    } as unknown as IServices;

    await getCoachingContextTool.handler(services, { days: 14 });

    expect(spy).toHaveBeenCalledWith({ days: 14 });
  });

  it("rejects days outside 1..max", () => {
    expect(schema.safeParse({ days: 0 }).success).toBe(false);
    expect(schema.safeParse({ days: 100000 }).success).toBe(false);
    expect(schema.safeParse({}).success).toBe(true);
  });
});

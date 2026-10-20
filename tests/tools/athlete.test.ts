import { describe, it, expect, vi } from "vitest";
import { getAthleteTool } from "../../src/tools/athlete.js";
import type { IServices } from "../../src/index.js";

describe("getAthlete tool handler", () => {
  it("reads the profile from the athlete service", async () => {
    const getAthlete = vi.fn().mockResolvedValue({});
    const services = { athlete: { getAthlete } } as unknown as IServices;

    await getAthleteTool.handler(services, {});

    expect(getAthlete).toHaveBeenCalledOnce();
  });
});

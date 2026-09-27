import { describe, it, expect, vi } from "vitest";
import { getAthleteTool } from "../../src/tools/athlete.js";
import type { IServices } from "../../src/index.js";

function createMockServices(): IServices {
  return {
    athlete: {
      getAthlete: vi.fn().mockResolvedValue({
        id: "i12345",
        name: "Test Athlete",
        ftp: 280,
        lthr: 168,
        weight: 75,
      }),
    },
  } as unknown as IServices;
}

describe("getAthlete tool handler", () => {
  it("returns athlete profile as JSON", async () => {
    const services = createMockServices();
    const parsed = (await getAthleteTool.handler(services, {})) as Record<
      string,
      unknown
    >;

    expect(parsed.name).toBe("Test Athlete");
    expect(parsed.ftp).toBe(280);
    expect(services.athlete.getAthlete).toHaveBeenCalledOnce();
  });
});

import { describe, it, expect, vi } from "vitest";
import { getAthleteTool } from "../../src/tools/athlete.js";
import type { IIntervalsClient } from "../../src/index.js";

function createMockClient(): IIntervalsClient {
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
  } as unknown as IIntervalsClient;
}

describe("getAthlete tool handler", () => {
  it("returns athlete profile as JSON", async () => {
    const client = createMockClient();
    const parsed = (await getAthleteTool.handler(client, {})) as Record<
      string,
      unknown
    >;

    expect(parsed.name).toBe("Test Athlete");
    expect(parsed.ftp).toBe(280);
    expect(client.athlete.getAthlete).toHaveBeenCalledOnce();
  });
});

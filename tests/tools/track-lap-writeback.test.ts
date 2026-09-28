import { describe, it, expect, vi } from "vitest";
import { writeTrackRunsTool } from "../../src/tools/track-lap-writeback.js";
import type { IServices } from "../../src/index.js";

const writeTrackRuns = writeTrackRunsTool.handler;
const schema = writeTrackRunsTool.schema;
const outputSchema = writeTrackRunsTool.outputSchema;

const result = {
  activityId: "i173732945",
  mode: "preview" as const,
  runs: [],
  intervalsReplaced: 3,
  notes: [],
};

function clientWith(spy = vi.fn().mockResolvedValue(result)) {
  return {
    services: { track: { write: spy } } as unknown as IServices,
    spy,
  };
}

describe("write_track_runs handler", () => {
  it("passes the inputs, preview included, to the track service", async () => {
    const { services, spy } = clientWith();
    const args = { activityId: "i173732945", sessionId: "s", preview: true };

    const out = await writeTrackRuns(services, args);

    expect(spy).toHaveBeenCalledWith(args);
    expect(out).toBe(result);
  });

  it("returns a result its own output schema accepts", async () => {
    const { services } = clientWith();
    const out = await writeTrackRuns(services, { sessionId: "s" });
    expect(outputSchema.safeParse(out).success).toBe(true);
  });

  it("takes preview as an optional boolean", () => {
    expect(schema.safeParse({ preview: "yes" }).success).toBe(false);
    expect(schema.safeParse({ preview: true }).success).toBe(true);
  });
});

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { computeTrackLapPowerTool } from "../../src/tools/track-lap-alignment.js";
import { createTrack } from "../../src/services/track/index.js";
import type { IServices } from "../../src/index.js";
import type { IActivitiesApi } from "../../src/services/activities/index.js";
import type { ActivityStreams } from "../../src/services/activities/types.js";

function read(name: string) {
  return readFileSync(
    fileURLToPath(
      new URL(`../fixtures/track-lap-alignment/${name}`, import.meta.url)
    ),
    "utf8"
  );
}

const SESSION = JSON.parse(read("track-session-2026-08-08.json"));
const SPLITS = read("splits-2026-08-08.csv");

function servicesWithStreams(): {
  services: IServices;
  requested: string[];
} {
  const requested: string[] = [];
  const activitiesApi: IActivitiesApi = {
    getActivities: async () => [],
    getActivity: async () => {
      throw new Error("not used");
    },
    getActivityLaps: async () => null,
    getActivityStreams: async (id) => {
      requested.push(id);
      return {
        time: SESSION.time,
        watts: SESSION.watts,
        cadence: SESSION.cadence,
        heartrate: SESSION.heartrate,
      } as ActivityStreams;
    },
  };
  const services = {
    track: createTrack({ activitiesApi }),
  } as unknown as IServices;
  return { services, requested };
}

const computeTrackLapPower = computeTrackLapPowerTool.handler;
const computeTrackLapPowerSchema = computeTrackLapPowerTool.schema;
const computeTrackLapPowerOutputSchema = computeTrackLapPowerTool.outputSchema;

describe("compute_track_lap_power", () => {
  it("returns a result its own output schema accepts", async () => {
    const { services } = servicesWithStreams();
    const result = await computeTrackLapPower(services, {
      activityId: "i173732945",
      splits: SPLITS,
    });

    expect(() => computeTrackLapPowerOutputSchema.parse(result)).not.toThrow();
    expect(result.runs).toHaveLength(4);
    expect(result.runs[0].average.watts).toBe(376);
    expect(result.runs[1].average.watts).toBe(380);
  });

  it("accepts a bare numeric activity id", async () => {
    const { services, requested } = servicesWithStreams();
    await computeTrackLapPower(services, {
      activityId: 173732945,
      splits: SPLITS,
    });
    expect(requested).toEqual(["i173732945"]);
  });

  it("leaves an already-prefixed id alone", async () => {
    const { services, requested } = servicesWithStreams();
    await computeTrackLapPower(services, {
      activityId: "i173732945",
      splits: SPLITS,
    });
    expect(requested).toEqual(["i173732945"]);
  });

  // "splits or sessionId" cannot be a schema refinement — the MCP adapter
  // registers `schema.shape`, which `.refine()` erases — so the handler owns it.
  it("refuses a call with neither splits nor a session id", async () => {
    const { services } = servicesWithStreams();
    expect(computeTrackLapPowerSchema.safeParse({}).success).toBe(true);
    await expect(
      computeTrackLapPower(services, { activityId: "i1" })
    ).rejects.toThrow(/Supply splits .* or sessionId/);
  });

  it("requires an activity id alongside pasted splits", async () => {
    const { services } = servicesWithStreams();
    await expect(
      computeTrackLapPower(services, { splits: SPLITS })
    ).rejects.toThrow(/activityId is required when splits are pasted/);
  });

  it("rejects a non-positive lap distance at the boundary", () => {
    expect(
      computeTrackLapPowerSchema.safeParse({
        activityId: "i1",
        splits: "x",
        lapDistanceMeters: 0,
      }).success
    ).toBe(false);
  });

  it("passes a custom lap distance through", async () => {
    const { services } = servicesWithStreams();
    const relabelled = SPLITS.split("\n")
      .map((line, i) => {
        if (i === 0 || !line.trim()) return line;
        const cells = line.split(",");
        cells[1] = ((Number(cells[1]) / 250) * 333.33).toFixed(2);
        return cells.join(",");
      })
      .join("\n");

    const result = await computeTrackLapPower(services, {
      activityId: "i173732945",
      splits: relabelled,
      lapDistanceMeters: 333.33,
    });
    expect(result.lapDistanceMeters).toBe(333.33);
  });

  it("surfaces a split-record error to the caller", async () => {
    const { services } = servicesWithStreams();
    await expect(
      computeTrackLapPower(services, {
        activityId: "i173732945",
        splits: "1,250,16.26,16.26\n1,500,32.69,17.43\n",
      })
    ).rejects.toThrow(/does not reconcile/);
  });
});

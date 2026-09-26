import { describe, it, expect, vi } from "vitest";
import { getPowerCurveTool } from "../../src/tools/power.js";
import type { IIntervalsClient } from "../../src/index.js";

const getPowerCurve = getPowerCurveTool.handler;

function createMockClient(): IIntervalsClient {
  return {
    powerCurves: {
      getPowerCurve: vi.fn().mockResolvedValue([
        { secs: 5, value: 900, activity_id: 1 },
        { secs: 60, value: 400, activity_id: 2 },
        { secs: 300, value: 320, activity_id: 1 },
      ]),
    },
  } as unknown as IIntervalsClient;
}

describe("getPowerCurve tool handler", () => {
  it("returns power curve as { points: [...] }", async () => {
    const client = createMockClient();
    const result = (await getPowerCurve(client, {})) as {
      points: Array<{ secs: number; value: number }>;
    };

    expect(result.points).toHaveLength(3);
    expect(result.points[0].secs).toBe(5);
    expect(result.points[0].value).toBe(900);
  });

  it("defaults type to Ride when omitted", async () => {
    const client = createMockClient();
    await getPowerCurve(client, { range: "90d" });
    expect(client.powerCurves.getPowerCurve).toHaveBeenCalledWith({
      type: "Ride",
      range: "90d",
    });
  });

  it("passes type and range options", async () => {
    const client = createMockClient();
    await getPowerCurve(client, { type: "Ride", range: "90d" });

    expect(client.powerCurves.getPowerCurve).toHaveBeenCalledWith({
      type: "Ride",
      range: "90d",
    });
  });
});

describe("getPowerCurve thinning", () => {
  const curve = {
    list: [
      {
        id: "1y",
        secs: [1, 5, 60, 300],
        watts: [1000, 900, 400, 320],
        values: [1000, 900, 400, 320],
        activity_id: ["a", "b", "c", "b"],
        watts_per_kg: [14, 13, 6, 5],
        wkg_activity_id: ["a", "b", "c", "b"],
        ranks: {},
        mapPlot: { startIndex: 1 },
        powerModels: [{ type: "MS_2P", criticalPower: 288 }],
      },
    ],
    activities: {
      a: { id: "a" },
      b: { id: "b" },
      c: { id: "c" },
      z: { id: "z" },
    },
  };
  const client = () =>
    ({
      powerCurves: { getPowerCurve: vi.fn().mockResolvedValue(curve) },
    }) as unknown as IIntervalsClient;

  type Out = {
    points: { list: Array<Record<string, unknown>>; activities: object };
  };

  it("drops heavy fields by default and keeps powerModels", async () => {
    const c = client();
    const { points } = (await getPowerCurve(c, { type: "Ride" })) as Out;
    const l = points.list[0];
    expect(l).not.toHaveProperty("values");
    expect(l).not.toHaveProperty("watts_per_kg");
    expect(l).not.toHaveProperty("wkg_activity_id");
    expect(l).not.toHaveProperty("ranks");
    expect(l).not.toHaveProperty("mapPlot");
    expect(l.watts).toEqual([1000, 900, 400, 320]);
    expect(l.powerModels).toHaveLength(1);
    expect(Object.keys(points.activities)).toEqual(["a", "b", "c"]);
    expect(c.powerCurves.getPowerCurve).toHaveBeenCalledWith({ type: "Ride" });
  });

  it("secs filter picks nearest points and reports the request", async () => {
    const { points } = (await getPowerCurve(client(), {
      secs: [60, 240],
    })) as Out;
    const l = points.list[0];
    expect(l.secs).toEqual([60, 300]);
    expect(l.watts).toEqual([400, 320]);
    expect(l.activity_id).toEqual(["c", "b"]);
    expect(l.requested_secs).toEqual([60, 240]);
    expect(Object.keys(points.activities)).toEqual(["b", "c"]);
  });

  it("full returns the raw curve", async () => {
    const { points } = (await getPowerCurve(client(), { full: true })) as Out;
    expect(points).toEqual(curve);
  });
});

import { describe, it, expect, vi } from "vitest";
import {
  MAX_FORECAST_DAYS,
  assertForecastWindow,
  forecastTrainingLoadTool,
} from "../../src/tools/training-load-forecast.js";
import type { IIntervalsClient } from "../../src/index.js";
import type { ForecastResult } from "../../src/services/training-load-forecast/index.js";

const RESULT: ForecastResult = {
  oldest: "2026-08-10",
  newest: "2026-08-10",
  basis: {
    ftp: 286,
    ftpSource: "athlete-sport-settings",
    powerZones: [55, 75, 90, 105, 120, 150, 999],
    ctlDays: 42,
    atlDays: 7,
    timeConstantsSource: "platform-defaults",
    seedDate: "2026-08-09",
    seedSource: "delivered-wellness",
    seedCtl: 54.228737,
    seedAtl: 51.943848,
    historyDays: 8,
  },
  days: [
    {
      date: "2026-08-10",
      load: 90,
      ctl: 55.070395,
      atl: 57.046887,
      tsb: -1.976492,
      ramp: 1.2345678,
    },
  ],
  weeks: [
    {
      weekStart: "2026-08-10",
      weekEnd: "2026-08-16",
      load: 90,
      durationSeconds: 3600,
      ctlStart: 54.228737,
      ctlEnd: 55.070395,
      ramp: 0.841658,
      complete: false,
    },
  ],
  sessions: [
    {
      date: "2026-08-10",
      name: "Steady hour",
      type: "Ride",
      origin: "proposed",
      load: 90,
      durationSeconds: 3600,
      source: "local-parse",
      normalizedPower: 226.4917,
      intensityFactor: 0.79192902,
    },
  ],
  notes: ["Strength sessions contribute no load."],
};

const forecastTrainingLoad = forecastTrainingLoadTool.handler;
const forecastTrainingLoadSchema = forecastTrainingLoadTool.schema;
const forecastTrainingLoadOutputSchema = forecastTrainingLoadTool.outputSchema;

function stubClient() {
  const forecast = { forecastTrainingLoad: vi.fn(async () => RESULT) };
  return {
    trainingLoadForecast: forecast,
  } as unknown as IIntervalsClient & { trainingLoadForecast: typeof forecast };
}

describe("forecast_training_load tool", () => {
  it("passes the window, sessions, seed and threshold straight through", async () => {
    const client = stubClient();
    await forecastTrainingLoad(client, {
      oldest: "2026-08-10",
      newest: "2026-08-16",
      sessions: [{ date: "2026-08-11", description: "- 60m 200w" }],
      seed: { ctl: 50, atl: 40 },
      ftp: 300,
    });
    expect(
      client.trainingLoadForecast.forecastTrainingLoad
    ).toHaveBeenCalledWith({
      oldest: "2026-08-10",
      newest: "2026-08-16",
      sessions: [{ date: "2026-08-11", description: "- 60m 200w" }],
      seed: { ctl: 50, atl: 40 },
      ftp: 300,
    });
  });

  it("returns a payload its own output schema accepts", async () => {
    const out = await forecastTrainingLoad(stubClient(), {
      oldest: "2026-08-10",
      newest: "2026-08-10",
    });
    expect(() => forecastTrainingLoadOutputSchema.parse(out)).not.toThrow();
  });

  it("rounds for reading without letting the rounding into the model", async () => {
    const out = await forecastTrainingLoad(stubClient(), {
      oldest: "2026-08-10",
      newest: "2026-08-10",
    });
    expect(out.days[0]).toMatchObject({
      ctl: 55.07,
      atl: 57.05,
      tsb: -1.98,
      ramp: 1.23,
    });
    // Normalised power to the watt, as the platform reports it.
    expect(out.sessions[0].normalizedPower).toBe(226);
    expect(out.sessions[0].intensityFactor).toBe(0.792);
    // Load is already the whole point the platform stores.
    expect(out.sessions[0].load).toBe(90);
  });

  it("keeps every session's load source in the payload", async () => {
    const out = await forecastTrainingLoad(stubClient(), {
      oldest: "2026-08-10",
      newest: "2026-08-10",
    });
    expect(out.sessions[0].source).toBe("local-parse");
    expect(out.basis.seedSource).toBe("delivered-wellness");
  });
});

describe("forecast_training_load window", () => {
  it("accepts a window exactly at the cap", () => {
    const start = new Date("2026-01-01T00:00:00Z");
    const end = new Date(start);
    end.setUTCDate(end.getUTCDate() + MAX_FORECAST_DAYS - 1);
    expect(() =>
      assertForecastWindow("2026-01-01", end.toISOString().slice(0, 10))
    ).not.toThrow();
  });

  it("refuses a window past the cap rather than truncating it", () => {
    expect(() => assertForecastWindow("2026-01-01", "2026-12-31")).toThrow(
      /too long/i
    );
  });

  it("refuses a backwards window", () => {
    expect(() => assertForecastWindow("2026-08-16", "2026-08-10")).toThrow(
      /must be on or after/
    );
  });

  it("rejects a malformed date at the schema", () => {
    expect(() =>
      forecastTrainingLoadSchema.parse({
        oldest: "10-08-2026",
        newest: "2026-08-16",
      })
    ).toThrow();
  });
});

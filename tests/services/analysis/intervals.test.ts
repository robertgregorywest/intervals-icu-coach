import { describe, it, expect } from "vitest";
import { compareIntervals } from "../../../src/services/analysis/intervals.js";
import type { Activity } from "../../../src/services/activities/index.js";

function makeActivity(
  id: string,
  intervals: Array<{
    average_watts: number;
    max_watts: number;
    average_heartrate: number;
    average_cadence: number;
    elapsed_time: number;
  }>
): Activity {
  return {
    id,
    name: `Activity ${id}`,
    start_date_local: "2024-01-01T08:00:00",
    type: "Ride",
    moving_time: 3600,
    elapsed_time: 3600,
    distance: 30000,
    total_elevation_gain: 200,
    icu_ftp: 280,
    icu_weighted_avg_watts: 220,
    icu_average_watts: 200,
    average_heartrate: 140,
    max_heartrate: 170,
    icu_intensity: 0.79,
    icu_training_load: 60,
    icu_variability_index: 1.1,
    icu_efficiency_factor: 1.5,
    average_cadence: 88,
    max_watts: 600,
    icu_intervals: intervals.map((i, idx) => ({
      id: idx,
      label: `Interval ${idx + 1}`,
      start_index: 0,
      end_index: 100,
      distance: 1000,
      ...i,
    })),
  };
}

describe("compareIntervals", () => {
  it("compares intervals across activities", () => {
    const a1 = makeActivity("i1", [
      {
        average_watts: 300,
        max_watts: 320,
        average_heartrate: 160,
        average_cadence: 90,
        elapsed_time: 240,
      },
      {
        average_watts: 310,
        max_watts: 330,
        average_heartrate: 162,
        average_cadence: 91,
        elapsed_time: 240,
      },
    ]);
    const a2 = makeActivity("i2", [
      {
        average_watts: 305,
        max_watts: 325,
        average_heartrate: 158,
        average_cadence: 89,
        elapsed_time: 240,
      },
      {
        average_watts: 315,
        max_watts: 335,
        average_heartrate: 165,
        average_cadence: 92,
        elapsed_time: 240,
      },
    ]);

    const result = compareIntervals([a1, a2]);

    expect(result.intervals).toHaveLength(2);
    expect(result.intervals[0].lapNumber).toBe(1);
    expect(result.intervals[0].values).toHaveLength(2);
    expect(result.summaries).toHaveLength(2);
    expect(result.summaries[0].intervalCount).toBe(2);
    // Guards the API field-name mapping: reads must come through populated, not
    // undefined (regression — source reads average_watts/elapsed_time).
    expect(result.intervals[0].values[0].avg_watts).toBe(300);
    expect(result.intervals[0].values[0].elapsed).toBe(240);
    expect(result.summaries[0].avgPower).toBe(305);
  });

  it("filters by minimum power", () => {
    const a = makeActivity("i1", [
      {
        average_watts: 100,
        max_watts: 120,
        average_heartrate: 120,
        average_cadence: 85,
        elapsed_time: 300,
      },
      {
        average_watts: 300,
        max_watts: 320,
        average_heartrate: 160,
        average_cadence: 90,
        elapsed_time: 240,
      },
    ]);

    const result = compareIntervals([a], { minPower: 200 });

    expect(result.summaries[0].intervalCount).toBe(1);
    expect(result.summaries[0].avgPower).toBe(300);
  });

  it("filters by target duration", () => {
    const a = makeActivity("i1", [
      {
        average_watts: 300,
        max_watts: 320,
        average_heartrate: 160,
        average_cadence: 90,
        elapsed_time: 240,
      },
      {
        average_watts: 200,
        max_watts: 220,
        average_heartrate: 140,
        average_cadence: 85,
        elapsed_time: 600,
      },
    ]);

    const result = compareIntervals([a], { targetDuration: 240 });

    expect(result.summaries[0].intervalCount).toBe(1);
    expect(result.summaries[0].avgPower).toBe(300);
  });

  it("handles activities with different interval counts", () => {
    const a1 = makeActivity("i1", [
      {
        average_watts: 300,
        max_watts: 320,
        average_heartrate: 160,
        average_cadence: 90,
        elapsed_time: 240,
      },
    ]);
    const a2 = makeActivity("i2", [
      {
        average_watts: 300,
        max_watts: 320,
        average_heartrate: 160,
        average_cadence: 90,
        elapsed_time: 240,
      },
      {
        average_watts: 310,
        max_watts: 330,
        average_heartrate: 162,
        average_cadence: 91,
        elapsed_time: 240,
      },
    ]);

    const result = compareIntervals([a1, a2]);

    expect(result.intervals).toHaveLength(2);
    expect(result.intervals[0].values).toHaveLength(2);
    expect(result.intervals[1].values).toHaveLength(1);
  });
});

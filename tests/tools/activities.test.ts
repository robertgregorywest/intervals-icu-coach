import { describe, it, expect, vi } from "vitest";
import {
  getActivitiesTool,
  getActivityTool,
  getActivityStreamsTool,
  getActivityLapsTool,
} from "../../src/tools/activities.js";
import type { IServices } from "../../src/index.js";
import type { IActivitiesApi } from "../../src/services/activities/index.js";

const getActivities = getActivitiesTool.handler;
const getActivity = getActivityTool.handler;
const getActivityStreams = getActivityStreamsTool.handler;
const getActivityLaps = getActivityLapsTool.handler;

function createMockServices(
  overrides: Partial<IActivitiesApi> = {}
): IServices {
  const activities = {
    getActivities: vi
      .fn()
      .mockResolvedValue([
        { id: "i1", name: "Morning Ride", icu_training_load: 65 },
      ]),
    getActivity: vi.fn().mockResolvedValue({
      id: "i1",
      name: "Morning Ride",
      icu_intervals: [],
    }),
    getActivityStreams: vi.fn().mockResolvedValue({
      watts: [200, 210],
      heartrate: [130, 135],
    }),
    ...overrides,
  };
  return { activities } as unknown as IServices;
}

describe("getActivities tool handler", () => {
  it("returns activities as JSON", async () => {
    const services = createMockServices();
    const result = await getActivities(services, {
      oldest: "2024-01-01",
      newest: "2024-01-31",
    });
    const parsed = result;

    expect(parsed.total).toBe(1);
    expect(parsed.count).toBe(1);
    expect(parsed.truncated).toBe(false);
    expect(parsed.activities[0].name).toBe("Morning Ride");
    expect(services.activities.getActivities).toHaveBeenCalledWith(
      "2024-01-01",
      "2024-01-31"
    );
  });
});

describe("getActivity tool handler", () => {
  it("returns single activity as JSON", async () => {
    const services = createMockServices();
    const result = await getActivity(services, { id: "i1" });
    const parsed = result;

    expect(parsed.name).toBe("Morning Ride");
    expect(services.activities.getActivity).toHaveBeenCalledWith(
      "i1",
      undefined
    );
  });

  it("normalizes bare number to i-prefixed string", async () => {
    const services = createMockServices();
    await getActivity(services, getActivityTool.schema.parse({ id: 1 }));

    expect(services.activities.getActivity).toHaveBeenCalledWith(
      "i1",
      undefined
    );
  });

  it("passes includeIntervals flag", async () => {
    const services = createMockServices();
    await getActivity(services, { id: "i1", includeIntervals: true });

    expect(services.activities.getActivity).toHaveBeenCalledWith("i1", true);
  });

  it("compacts interval analysis so a 4x2min block is discoverable", async () => {
    const services = createMockServices({
      getActivity: vi.fn().mockResolvedValue({
        id: "i149578078",
        name: "Pursuit sharpening — 4 × 2min",
        icu_average_watts: 164,
        interval_summary: ["1x 4m 151w", "4x 2m 369w", "1x 10m8s 111w"],
        icu_intervals: [
          {
            type: "WORK",
            label: null,
            start_time: 1294,
            elapsed_time: 120,
            average_watts: 383,
            max_watts: 427,
            average_heartrate: 142,
            average_cadence: 91,
            group_id: "120s@369w91rpm",
            // noise fields that must be dropped from the projection
            average_smo2: null,
            average_wind_speed: 5.5,
            tailwind_percent: 29,
          },
          {
            type: "RECOVERY",
            label: null,
            start_time: 2494,
            elapsed_time: 266,
            average_watts: 123,
            max_watts: 255,
            average_heartrate: 130,
            average_cadence: 60,
            group_id: null,
          },
        ],
        icu_groups: [
          {
            id: "120s@369w91rpm",
            count: 4,
            elapsed_time: 120,
            average_watts: 369,
            max_watts: 462,
            average_heartrate: 142,
            average_cadence: 91,
            average_lactate: null,
          },
        ],
      }),
    });

    const result = (await getActivity(services, {
      id: "i149578078",
      includeIntervals: true,
    })) as {
      name: string;
      icu_average_watts: number;
      icu_intervals?: unknown;
      icu_groups?: unknown;
      interval_summary: string[];
      groups: Array<Record<string, unknown>>;
      intervals: Array<Record<string, unknown>>;
    };

    // Grouped structure is front and centre.
    expect(result.groups).toHaveLength(1);
    expect(result.groups[0]).toMatchObject({
      sig: "120s@369w91rpm",
      count: 4,
      avgW: 369,
      dur: 120,
    });
    expect(result.interval_summary).toContain("4x 2m 369w");

    // Per-lap detail is slim and links to its group via grp.
    expect(result.intervals).toHaveLength(2);
    expect(result.intervals[0]).toMatchObject({
      i: 0,
      type: "WORK",
      avgW: 383,
      grp: "120s@369w91rpm",
    });
    // Recovery lap has no group_id, so grp is omitted.
    expect(result.intervals[1].grp).toBeUndefined();

    // Raw blobs and their ~70 noise fields are gone; other activity fields stay.
    expect(result.icu_intervals).toBeUndefined();
    expect(result.icu_groups).toBeUndefined();
    expect("average_smo2" in result.intervals[0]).toBe(false);
    expect(result.icu_average_watts).toBe(164);
    expect(result.name).toBe("Pursuit sharpening — 4 × 2min");
  });

  it("surfaces Strava stub as a structured limitation message", async () => {
    const services = createMockServices({
      getActivity: vi.fn().mockResolvedValue({
        id: "i999",
        source: "STRAVA",
        start_date_local: "2026-05-20T08:00:00",
        _note: "STRAVA activities are not available via the API",
      }),
    });
    const result = (await getActivity(services, { id: "i999" })) as Record<
      string,
      unknown
    >;

    expect(result._strava_limitation).toBe(true);
    expect(typeof result.message).toBe("string");
  });
});

describe("getActivityStreams tool handler", () => {
  it("returns streams in a packed envelope, full resolution when small", async () => {
    const services = createMockServices();
    const result = (await getActivityStreams(services, {
      id: "i1",
    })) as {
      samples: number;
      original_samples: number;
      downsampled: boolean;
      stride: number;
      streams: Record<string, number[]>;
    };

    expect(result.downsampled).toBe(false);
    expect(result.stride).toBe(1);
    expect(result.samples).toBe(2);
    expect(result.original_samples).toBe(2);
    expect(result.streams.watts).toEqual([200, 210]);
    expect(services.activities.getActivityStreams).toHaveBeenCalledWith(
      "i1",
      undefined
    );
  });

  it("downsamples large streams to fit the budget, preserving coverage", async () => {
    const watts = Array.from({ length: 20000 }, (_, i) => i);
    const heartrate = Array.from({ length: 20000 }, (_, i) => 100 + (i % 60));
    const services = createMockServices({
      getActivityStreams: vi.fn().mockResolvedValue({ watts, heartrate }),
    });

    const result = (await getActivityStreams(services, { id: "i1" })) as {
      samples: number;
      original_samples: number;
      downsampled: boolean;
      stride: number;
      streams: Record<string, number[]>;
    };

    expect(result.downsampled).toBe(true);
    expect(result.stride).toBeGreaterThan(1);
    expect(result.original_samples).toBe(20000);
    expect(result.samples).toBeLessThan(20000);
    // First sample is kept (index 0) and arrays stay aligned across streams.
    expect(result.streams.watts[0]).toBe(0);
    expect(result.streams.watts.length).toBe(result.streams.heartrate.length);
    expect(
      JSON.stringify({ streams: result.streams }).length
    ).toBeLessThanOrEqual(40_000);
  });

  it("normalizes bare number to i-prefixed string", async () => {
    const services = createMockServices();
    await getActivityStreams(
      services,
      getActivityStreamsTool.schema.parse({ id: 1 })
    );

    expect(services.activities.getActivityStreams).toHaveBeenCalledWith(
      "i1",
      undefined
    );
  });

  it("passes types filter", async () => {
    const services = createMockServices();
    await getActivityStreams(services, { id: "i1", types: ["watts"] });

    expect(services.activities.getActivityStreams).toHaveBeenCalledWith("i1", [
      "watts",
    ]);
  });
});

describe("getActivityLaps tool handler", () => {
  it("returns the recorded laps and names the record", async () => {
    const services = createMockServices({
      getActivityLaps: vi.fn().mockResolvedValue([
        {
          index: 0,
          startTimeSeconds: 0,
          durationSeconds: 600,
          averageWatts: 150,
        },
        {
          index: 1,
          startTimeSeconds: 600,
          durationSeconds: 1245,
          timerSeconds: 1245,
          distanceMeters: 12000.5,
          averageWatts: 285,
          normalizedWatts: 288,
          averageHeartrate: 170,
          averageCadence: 92,
        },
      ]),
    });
    const result = await getActivityLaps(services, { id: "i176326434" });

    expect(result.record).toBe("device-laps");
    expect(result.count).toBe(2);
    expect(result.laps[1]).toMatchObject({
      startSeconds: 600,
      elapsedSeconds: 1245,
      avgWatts: 285,
      npWatts: 288,
      distanceMeters: 12000.5,
    });
  });

  it("reports absent with a reason when no FIT file can be read", async () => {
    const services = createMockServices({
      getActivityLaps: vi.fn().mockResolvedValue(null),
    });
    const result = await getActivityLaps(services, { id: "i1" });

    expect(result.record).toBe("absent");
    expect(result.laps).toEqual([]);
    expect(result.note).toMatch(/no original FIT upload/);
  });

  it("notes that a single lap records no structure", async () => {
    const services = createMockServices({
      getActivityLaps: vi
        .fn()
        .mockResolvedValue([
          { index: 0, startTimeSeconds: 0, durationSeconds: 3600 },
        ]),
    });
    const result = await getActivityLaps(services, { id: "i1" });

    expect(result.record).toBe("device-laps");
    expect(result.note).toMatch(/single lap/);
  });

  it("normalizes a bare numeric id", async () => {
    const getLaps = vi.fn().mockResolvedValue(null);
    await getActivityLaps(
      createMockServices({ getActivityLaps: getLaps }),
      getActivityLapsTool.schema.parse({ id: 176326434 })
    );
    expect(getLaps).toHaveBeenCalledWith("i176326434");
  });
});

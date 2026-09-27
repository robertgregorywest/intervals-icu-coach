import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { HttpClient } from "../../src/client.js";
import { ActivitiesApi } from "../../src/services/activities/activities.js";
import { normalizeActivityId } from "../../src/services/activities/index.js";

function createMockFetch(status: number, body: unknown) {
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? "OK" : "Error",
    headers: new Headers({ "content-type": "application/json" }),
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(JSON.stringify(body)),
  } as unknown as Response);
}

const config = {
  apiKey: "test-api-key",
  athleteId: "i12345",
  baseUrl: "https://intervals.icu",
};

describe("ActivitiesApi", () => {
  it("GETs activities with date range", async () => {
    const activities = [{ id: "i1", name: "Morning Ride" }];
    const mockFetch = createMockFetch(200, activities);
    const httpClient = new HttpClient(config, mockFetch);
    const api = new ActivitiesApi(httpClient, config.athleteId);

    const result = await api.getActivities("2024-01-01", "2024-01-31");

    expect(result).toEqual(activities);
    const [url] = mockFetch.mock.calls[0];
    expect(url).toBe(
      "https://intervals.icu/api/v1/athlete/i12345/activities?oldest=2024-01-01&newest=2024-01-31"
    );
  });

  it("GETs single activity without intervals", async () => {
    const activity = { id: "i42", name: "Ride" };
    const mockFetch = createMockFetch(200, activity);
    const httpClient = new HttpClient(config, mockFetch);
    const api = new ActivitiesApi(httpClient, config.athleteId);

    await api.getActivity("i42");

    const [url] = mockFetch.mock.calls[0];
    expect(url).toBe("https://intervals.icu/api/v1/activity/i42");
  });

  it("GETs single activity with intervals", async () => {
    const mockFetch = createMockFetch(200, { id: "i42" });
    const httpClient = new HttpClient(config, mockFetch);
    const api = new ActivitiesApi(httpClient, config.athleteId);

    await api.getActivity("i42", true);

    const [url] = mockFetch.mock.calls[0];
    expect(url).toBe(
      "https://intervals.icu/api/v1/activity/i42?intervals=true"
    );
  });

  it("GETs activity streams with type filter", async () => {
    const streams = { watts: [200, 210], heartrate: [130, 135] };
    const mockFetch = createMockFetch(200, streams);
    const httpClient = new HttpClient(config, mockFetch);
    const api = new ActivitiesApi(httpClient, config.athleteId);

    const result = await api.getActivityStreams("i42", ["watts", "heartrate"]);

    expect(result).toEqual(streams);
    const [url] = mockFetch.mock.calls[0];
    expect(url).toBe(
      "https://intervals.icu/api/v1/activity/i42/streams.json?types=watts,heartrate"
    );
  });

  it("GETs activity streams without type filter", async () => {
    const mockFetch = createMockFetch(200, {});
    const httpClient = new HttpClient(config, mockFetch);
    const api = new ActivitiesApi(httpClient, config.athleteId);

    await api.getActivityStreams("i42");

    const [url] = mockFetch.mock.calls[0];
    expect(url).toBe("https://intervals.icu/api/v1/activity/i42/streams.json");
  });

  it("normalises array-shaped streams response into a keyed object", async () => {
    const arrayResponse = [
      { type: "watts", name: null, data: [200, 210, 220] },
      { type: "heartrate", name: null, data: [130, 135, 140] },
    ];
    const mockFetch = createMockFetch(200, arrayResponse);
    const httpClient = new HttpClient(config, mockFetch);
    const api = new ActivitiesApi(httpClient, config.athleteId);

    const result = await api.getActivityStreams("i42", ["watts", "heartrate"]);

    expect(result.watts).toEqual([200, 210, 220]);
    expect(result.heartrate).toEqual([130, 135, 140]);
  });

  it("passes through already-keyed streams response unchanged", async () => {
    const keyed = { watts: [200, 210], heartrate: [130, 135] };
    const mockFetch = createMockFetch(200, keyed);
    const httpClient = new HttpClient(config, mockFetch);
    const api = new ActivitiesApi(httpClient, config.athleteId);

    const result = await api.getActivityStreams("i42", ["watts", "heartrate"]);

    expect(result).toEqual(keyed);
  });
});

/**
 * Laps come from the original upload, which not every activity has. Absence is
 * ordinary — the caller falls back to the derived intervals — so every failure
 * mode has to reduce to `null` rather than to an exception that loses the review.
 */
describe("ActivitiesApi.getActivityLaps", () => {
  function binaryFetch(bytes: Uint8Array) {
    return vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      statusText: "OK",
      headers: new Headers({ "content-type": "application/octet-stream" }),
      arrayBuffer: () => Promise.resolve(bytes.buffer),
    } as unknown as Response);
  }

  it("GETs the original upload as bytes", async () => {
    const mockFetch = binaryFetch(new Uint8Array([1, 2, 3]));
    const api = new ActivitiesApi(
      new HttpClient(config, mockFetch),
      config.athleteId
    );

    await api.getActivityLaps("i42");

    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toBe("https://intervals.icu/api/v1/activity/i42/file");
    expect((init as RequestInit).method).toBe("GET");
  });

  it("returns null when the activity has no file (Strava sync)", async () => {
    const mockFetch = createMockFetch(404, { message: "not found" });
    const api = new ActivitiesApi(
      new HttpClient(config, mockFetch),
      config.athleteId
    );

    await expect(api.getActivityLaps("i42")).resolves.toBeNull();
  });

  it("returns null when the upload is not a FIT file", async () => {
    const mockFetch = binaryFetch(new TextEncoder().encode("<gpx/>"));
    const api = new ActivitiesApi(
      new HttpClient(config, mockFetch),
      config.athleteId
    );

    await expect(api.getActivityLaps("i42")).resolves.toBeNull();
  });

  it("returns null on an empty body", async () => {
    const mockFetch = binaryFetch(new Uint8Array(0));
    const api = new ActivitiesApi(
      new HttpClient(config, mockFetch),
      config.athleteId
    );

    await expect(api.getActivityLaps("i42")).resolves.toBeNull();
  });
});

describe("ActivitiesApi intervals", () => {
  const writeResponse = JSON.parse(
    readFileSync(
      new URL(
        "../fixtures/track-lap-writeback/intervals-write-response.json",
        import.meta.url
      ),
      "utf8"
    )
  );

  it("GETs the interval document", async () => {
    const mockFetch = createMockFetch(200, writeResponse);
    const api = new ActivitiesApi(
      new HttpClient(config, mockFetch),
      config.athleteId
    );

    const doc = await api.getActivityIntervals("i42");

    expect(doc.icu_intervals).toHaveLength(4);
    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toBe("https://intervals.icu/api/v1/activity/i42/intervals");
    expect(init.method ?? "GET").toBe("GET");
  });

  it("PUTs a bare array with all=true and no metric fields", async () => {
    const mockFetch = createMockFetch(200, writeResponse);
    const api = new ActivitiesApi(
      new HttpClient(config, mockFetch),
      config.athleteId
    );

    await api.replaceActivityIntervals("i42", [
      { type: "WORK", start_index: 904, end_index: 920, label: "Run 1" },
    ]);

    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toBe(
      "https://intervals.icu/api/v1/activity/i42/intervals?all=true"
    );
    expect(init.method).toBe("PUT");

    const body = JSON.parse(init.body);
    expect(Array.isArray(body)).toBe(true);
    expect(Object.keys(body[0]).sort()).toEqual([
      "end_index",
      "label",
      "start_index",
      "type",
    ]);
  });

  it("returns the platform's document, backfill and all", async () => {
    // Captured from a live probe: two intervals were sent covering samples
    // 904-934 of a 4340-sample activity, and four came back. The two extras are
    // Intervals.icu's own, filling the stretches nothing was written over.
    const mockFetch = createMockFetch(200, writeResponse);
    const api = new ActivitiesApi(
      new HttpClient(config, mockFetch),
      config.athleteId
    );

    const doc = await api.replaceActivityIntervals("i42", [
      { type: "WORK", start_index: 904, end_index: 920, label: "PROBE Lap 1" },
      { type: "WORK", start_index: 920, end_index: 934, label: "PROBE Lap 2" },
    ]);

    expect(doc.icu_intervals).toHaveLength(4);
    expect(doc.icu_intervals.map((i) => i.label)).toEqual([
      null,
      "PROBE Lap 1",
      "PROBE Lap 2",
      null,
    ]);
    // Metrics come back computed by the platform, none of them sent.
    expect(doc.icu_intervals[1].average_watts).toBe(359);
  });
});

describe("normalizeActivityId", () => {
  it("prefixes a bare id and leaves a prefixed one alone", () => {
    expect(normalizeActivityId(173732945)).toBe("i173732945");
    expect(normalizeActivityId("173732945")).toBe("i173732945");
    expect(normalizeActivityId("i173732945")).toBe("i173732945");
  });
});

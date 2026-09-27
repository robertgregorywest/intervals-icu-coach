import { describe, it, expect, vi } from "vitest";
import { HttpClient } from "../../../src/client.js";
import { PowerCurvesApi } from "../../../src/services/power-curves/power-curves.js";

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

describe("PowerCurvesApi", () => {
  it("GETs power curve with defaults", async () => {
    const curve = [{ secs: 5, value: 900 }];
    const mockFetch = createMockFetch(200, curve);
    const httpClient = new HttpClient(config, mockFetch);
    const api = new PowerCurvesApi(httpClient, config.athleteId);

    const result = await api.getPowerCurve();

    expect(result).toEqual(curve);
    const [url] = mockFetch.mock.calls[0];
    expect(url).toBe(
      "https://intervals.icu/api/v1/athlete/i12345/power-curves-ext"
    );
  });

  it("GETs power curve with type and range", async () => {
    const mockFetch = createMockFetch(200, []);
    const httpClient = new HttpClient(config, mockFetch);
    const api = new PowerCurvesApi(httpClient, config.athleteId);

    await api.getPowerCurve({ type: "Ride", range: "90d" });

    const [url] = mockFetch.mock.calls[0];
    expect(url).toBe(
      "https://intervals.icu/api/v1/athlete/i12345/power-curves-ext?type=Ride&curves=90d"
    );
  });

  it("GETs power curve with custom date range", async () => {
    const mockFetch = createMockFetch(200, []);
    const httpClient = new HttpClient(config, mockFetch);
    const api = new PowerCurvesApi(httpClient, config.athleteId);

    await api.getPowerCurve({ range: "r.2024-01-01.2024-06-30" });

    const [url] = mockFetch.mock.calls[0];
    expect(url).toBe(
      "https://intervals.icu/api/v1/athlete/i12345/power-curves-ext?curves=r.2024-01-01.2024-06-30"
    );
  });
});

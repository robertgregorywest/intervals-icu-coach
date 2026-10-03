import { describe, it, expect, vi } from "vitest";
import { HttpClient, HttpError } from "../../src/client.js";
import { EventsApi, MAX_RANGE_DAYS } from "../../src/services/events/events.js";
import type { IntervalsEvent } from "../../src/types.js";

function createMockFetch(
  status: number,
  body: unknown,
  contentType = "application/json"
) {
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? "OK" : "Error",
    headers: new Headers({ "content-type": contentType }),
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(JSON.stringify(body)),
  } as unknown as Response);
}

const config = {
  apiKey: "test-api-key",
  athleteId: "i12345",
  baseUrl: "https://intervals.icu",
};

describe("EventsApi", () => {
  describe("getEvents", () => {
    it("GETs events with date range", async () => {
      const events = [{ id: 1, name: "Test Workout" }];
      const mockFetch = createMockFetch(200, events);
      const httpClient = new HttpClient(config, mockFetch);
      const eventsApi = new EventsApi(httpClient, config.athleteId);

      const result = await eventsApi.getEvents("2024-01-01", "2024-01-31");

      expect(result).toEqual(events);
      const [url] = mockFetch.mock.calls[0];
      expect(url).toBe(
        "https://intervals.icu/api/v1/athlete/i12345/events?oldest=2024-01-01&newest=2024-01-31"
      );
    });

    it("refuses a range past MAX_RANGE_DAYS before fetching", async () => {
      const mockFetch = createMockFetch(200, []);
      const eventsApi = new EventsApi(
        new HttpClient(config, mockFetch),
        config.athleteId
      );

      await expect(
        eventsApi.getEvents("2025-01-01", "2026-01-01")
      ).rejects.toThrow(/spans 366 days, over the 365-day maximum/);
      expect(MAX_RANGE_DAYS).toBe(365);
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it("GETs events with resolve parameter", async () => {
      const mockFetch = createMockFetch(200, []);
      const httpClient = new HttpClient(config, mockFetch);
      const eventsApi = new EventsApi(httpClient, config.athleteId);

      await eventsApi.getEvents("2024-01-01", "2024-01-31", true);

      const [url] = mockFetch.mock.calls[0];
      expect(url).toContain("&resolve=true");
    });
  });

  describe("getEvent", () => {
    it("GETs a single event", async () => {
      const event = { id: 42, name: "Test Workout" };
      const mockFetch = createMockFetch(200, event);
      const httpClient = new HttpClient(config, mockFetch);
      const eventsApi = new EventsApi(httpClient, config.athleteId);

      const result = await eventsApi.getEvent(42);

      expect(result).toEqual(event);
      const [url] = mockFetch.mock.calls[0];
      expect(url).toBe("https://intervals.icu/api/v1/athlete/i12345/events/42");
    });
  });

  describe("createEvents", () => {
    it("POSTs events to the bulk endpoint with upsert", async () => {
      const responseEvents = [{ id: 1, name: "Test Workout" }];
      const mockFetch = createMockFetch(200, responseEvents);
      const httpClient = new HttpClient(config, mockFetch);
      const eventsApi = new EventsApi(httpClient, config.athleteId);

      const events: IntervalsEvent[] = [
        {
          category: "WORKOUT",
          start_date_local: "2024-03-30T00:00:00",
          type: "Ride",
          name: "Test Workout",
          description: "- 10m 60%",
          external_id: "test-1",
        },
      ];

      await eventsApi.createEvents(events);

      expect(mockFetch).toHaveBeenCalledOnce();
      const [url, options] = mockFetch.mock.calls[0];
      expect(url).toBe(
        "https://intervals.icu/api/v1/athlete/i12345/events/bulk?upsert=true"
      );
      expect(options.method).toBe("POST");
      expect(JSON.parse(options.body as string)).toEqual(events);
    });

    it("sends correct Basic auth header", async () => {
      const mockFetch = createMockFetch(200, []);
      const httpClient = new HttpClient(config, mockFetch);
      const eventsApi = new EventsApi(httpClient, config.athleteId);

      await eventsApi.createEvents([]);

      const [, options] = mockFetch.mock.calls[0];
      const expectedAuth = `Basic ${btoa("API_KEY:test-api-key")}`;
      expect(options.headers.Authorization).toBe(expectedAuth);
    });

    it("throws HttpError on failure", async () => {
      const mockFetch = createMockFetch(401, {
        message: "Unauthorized",
      });
      const httpClient = new HttpClient(config, mockFetch);
      const eventsApi = new EventsApi(httpClient, config.athleteId);

      await expect(eventsApi.createEvents([])).rejects.toThrow(HttpError);
      await expect(eventsApi.createEvents([])).rejects.toThrow("Unauthorized");
    });
  });

  describe("deleteEvents", () => {
    it("PUTs delete request to bulk-delete endpoint", async () => {
      const mockFetch = createMockFetch(200, undefined);
      const httpClient = new HttpClient(config, mockFetch);
      const eventsApi = new EventsApi(httpClient, config.athleteId);

      const ids = [{ external_id: "test-1" }, { id: 12345 }];
      await eventsApi.deleteEvents(ids);

      const [url, options] = mockFetch.mock.calls[0];
      expect(url).toBe(
        "https://intervals.icu/api/v1/athlete/i12345/events/bulk-delete"
      );
      expect(options.method).toBe("PUT");
      expect(JSON.parse(options.body as string)).toEqual(ids);
    });
  });

  describe("updateEvent", () => {
    it("PUTs update to single event endpoint", async () => {
      const updated = { id: 42, name: "Updated" };
      const mockFetch = createMockFetch(200, updated);
      const httpClient = new HttpClient(config, mockFetch);
      const eventsApi = new EventsApi(httpClient, config.athleteId);

      const result = await eventsApi.updateEvent(42, { name: "Updated" });

      expect(result).toEqual(updated);
      const [url, options] = mockFetch.mock.calls[0];
      expect(url).toBe("https://intervals.icu/api/v1/athlete/i12345/events/42");
      expect(options.method).toBe("PUT");
      expect(JSON.parse(options.body as string)).toEqual({ name: "Updated" });
    });
  });

  describe("deleteEvent", () => {
    it("DELETEs a single event", async () => {
      const mockFetch = createMockFetch(200, undefined);
      const httpClient = new HttpClient(config, mockFetch);
      const eventsApi = new EventsApi(httpClient, config.athleteId);

      await eventsApi.deleteEvent(42);

      const [url, options] = mockFetch.mock.calls[0];
      expect(url).toBe("https://intervals.icu/api/v1/athlete/i12345/events/42");
      expect(options.method).toBe("DELETE");
    });
  });
});

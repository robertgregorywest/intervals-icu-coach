import { vi } from "vitest";
import { HttpClient } from "../../src/client.js";
import { ActivitiesApi } from "../../src/services/activities/activities.js";
import { EventsApi } from "../../src/services/events/events.js";

/**
 * The one fixture harness for the execution-review lenses: a fetch routed by
 * URL, behind the real HTTP client and API wrappers, so a test describes the
 * Intervals.icu surface a lens touches and asserts on exactly which calls it
 * made.
 */

export const config = {
  apiKey: "test-api-key",
  athleteId: "i12345",
  baseUrl: "https://intervals.icu",
};

/**
 * A route's body: JSON, raw bytes (`Uint8Array`), `null` for a 404 — the shape
 * of an activity with no original upload to read laps from — or a function of
 * the URL returning any of those, for a route that answers per id.
 */
export type RouteBody = unknown | ((url: string) => unknown);
export type Route = [RegExp, RouteBody];

/** First matching route wins, so list narrower patterns first. */
export function routedFetch(routes: Route[]) {
  return vi.fn(async (url: string, _init?: RequestInit) => {
    for (const [pattern, route] of routes) {
      if (!pattern.test(url)) continue;
      const body = typeof route === "function" ? route(url) : route;

      if (body === null) {
        return {
          ok: false,
          status: 404,
          statusText: "Not Found",
          headers: new Headers({ "content-type": "application/json" }),
          json: () => Promise.resolve({ message: "not found" }),
          text: () => Promise.resolve('{"message":"not found"}'),
        } as unknown as Response;
      }

      if (body instanceof Uint8Array) {
        return {
          ok: true,
          status: 200,
          statusText: "OK",
          headers: new Headers({
            "content-type": "application/octet-stream",
          }),
          arrayBuffer: () =>
            Promise.resolve(
              body.buffer.slice(
                body.byteOffset,
                body.byteOffset + body.byteLength
              )
            ),
        } as unknown as Response;
      }

      return {
        ok: true,
        status: 200,
        statusText: "OK",
        headers: new Headers({ "content-type": "application/json" }),
        json: () => Promise.resolve(body),
        text: () => Promise.resolve(JSON.stringify(body)),
      } as unknown as Response;
    }
    throw new Error(`unexpected request: ${url}`);
  });
}

export type RoutedFetch = ReturnType<typeof routedFetch>;

/** The real API wrappers over a routed fetch. */
export function intervalsApis(fetchFn: RoutedFetch) {
  const httpClient = new HttpClient(config, fetchFn as never);
  return {
    activitiesApi: new ActivitiesApi(httpClient, config.athleteId),
    eventsApi: new EventsApi(httpClient, config.athleteId),
  };
}

/** Every URL requested so far, in order. */
export function requested(fetchFn: RoutedFetch): string[] {
  return fetchFn.mock.calls.map(([url]) => url);
}

import { describe, it, expect, vi } from "vitest";
import { fileURLToPath } from "node:url";
import {
  listTrackSessionsTool,
  getTrackSessionTool,
  compareTrackSessionsTool,
} from "../../src/tools/track-sessions.js";
import { createTrack } from "../../src/services/track/index.js";
import type { IActivitiesApi } from "../../src/services/activities/index.js";
import type { IServices } from "../../src/index.js";

const FIXTURES = fileURLToPath(
  new URL("../fixtures/track-sessions", import.meta.url)
);

/** The real service behind the services interface, reading the fixtures. */
function fixtureServices(): IServices {
  const service = createTrack({
    activitiesApi: {} as IActivitiesApi,
    recordsDir: FIXTURES,
  });
  return {
    track: {
      listSessions: vi.fn(() => service.listSessions()),
      getSession: vi.fn((o) => service.getSession(o)),
      compareSessions: vi.fn((o) => service.compareSessions(o)),
    },
  } as unknown as IServices;
}

const listTrackSessions = listTrackSessionsTool.handler;
const getTrackSession = getTrackSessionTool.handler;
const compareTrackSessions = compareTrackSessionsTool.handler;
const listTrackSessionsSchema = listTrackSessionsTool.schema;
const getTrackSessionSchema = getTrackSessionTool.schema;
const compareTrackSessionsSchema = compareTrackSessionsTool.schema;
const listTrackSessionsOutputSchema = listTrackSessionsTool.outputSchema;
const getTrackSessionOutputSchema = getTrackSessionTool.outputSchema;
const compareTrackSessionsOutputSchema = compareTrackSessionsTool.outputSchema;

describe("track session tool schemas", () => {
  it("takes no arguments to list", () => {
    expect(listTrackSessionsSchema.parse({})).toEqual({});
  });

  it("requires an id to get a session", () => {
    expect(getTrackSessionSchema.safeParse({}).success).toBe(false);
    expect(getTrackSessionSchema.safeParse({ id: "" }).success).toBe(false);
    expect(getTrackSessionSchema.parse({ id: "x", segmentLaps: 2 })).toEqual({
      id: "x",
      segmentLaps: 2,
    });
  });

  it("requires two runs to compare, because one is not a comparison", () => {
    expect(compareTrackSessionsSchema.safeParse({ runs: ["a"] }).success).toBe(
      false
    );
    expect(
      compareTrackSessionsSchema.safeParse({ runs: ["a", "b"] }).success
    ).toBe(true);
  });

  it("rejects a fractional segmentLaps", () => {
    expect(
      getTrackSessionSchema.safeParse({ id: "x", segmentLaps: 1.5 }).success
    ).toBe(false);
  });
});

describe("track session tool handlers", () => {
  it("lists sessions in a shape matching the declared output schema", async () => {
    const services = fixtureServices();
    const result = await listTrackSessions(services, {});
    expect(listTrackSessionsOutputSchema.parse(result)).toBeTruthy();
    expect(result.sessions).toHaveLength(4);
    expect(services.track.listSessions).toHaveBeenCalled();
  });

  it("passes id and segmentLaps through, and matches the output schema", async () => {
    const services = fixtureServices();
    const result = await getTrackSession(services, {
      id: "2026-nationals-ip",
      segmentLaps: 2,
    });
    expect(getTrackSessionOutputSchema.parse(result)).toBeTruthy();
    expect(services.track.getSession).toHaveBeenCalledWith({
      id: "2026-nationals-ip",
      segmentLaps: 2,
    });
    expect(result.runs[0].summary.opening).toMatchObject({
      fromLap: 2,
      toLap: 3,
    });
  });

  it("compares runs in a shape matching the declared output schema", async () => {
    const services = fixtureServices();
    const result = await compareTrackSessions(services, {
      runs: ["2026-09-06-bmrc-ip", "2026-nationals-ip"],
    });
    expect(compareTrackSessionsOutputSchema.parse(result)).toBeTruthy();
    expect(result.summary.map((r) => r.label)).toEqual([
      "Total",
      "Flying",
      "Opening",
      "Closing",
      "Decline",
    ]);
  });
});

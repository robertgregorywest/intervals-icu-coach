import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createServices } from "../src/index.js";

describe("createServices config validation", () => {
  const original = {
    INTERVALS_API_KEY: process.env.INTERVALS_API_KEY,
    INTERVALS_ATHLETE_ID: process.env.INTERVALS_ATHLETE_ID,
  };

  beforeEach(() => {
    delete process.env.INTERVALS_API_KEY;
    delete process.env.INTERVALS_ATHLETE_ID;
  });

  afterEach(() => {
    if (original.INTERVALS_API_KEY !== undefined)
      process.env.INTERVALS_API_KEY = original.INTERVALS_API_KEY;
    if (original.INTERVALS_ATHLETE_ID !== undefined)
      process.env.INTERVALS_ATHLETE_ID = original.INTERVALS_ATHLETE_ID;
  });

  it("rejects missing apiKey", () => {
    expect(() => createServices()).toThrow(/API key required/);
  });

  it("rejects whitespace-only apiKey", () => {
    expect(() => createServices({ apiKey: "   " })).toThrow(/API key required/);
  });

  it("rejects athleteId with non-alphanumeric characters", () => {
    expect(() =>
      createServices({ apiKey: "k", athleteId: "../etc/passwd" })
    ).toThrow(/Invalid athlete ID/);
  });

  it("rejects athleteId with whitespace", () => {
    expect(() => createServices({ apiKey: "k", athleteId: "i 123" })).toThrow(
      /Invalid athlete ID/
    );
  });

  it("rejects unparseable baseUrl", () => {
    expect(() => createServices({ apiKey: "k", baseUrl: "not a url" })).toThrow(
      /Invalid base URL/
    );
  });

  it("rejects non-http(s) baseUrl protocol", () => {
    expect(() =>
      createServices({ apiKey: "k", baseUrl: "file:///etc/hosts" })
    ).toThrow(/Invalid base URL/);
  });

  it("accepts valid config with default athleteId", () => {
    expect(() => createServices({ apiKey: "k" })).not.toThrow();
  });

  it('accepts athleteId "0"', () => {
    expect(() => createServices({ apiKey: "k", athleteId: "0" })).not.toThrow();
  });

  it('accepts athleteId "i12345"', () => {
    expect(() =>
      createServices({ apiKey: "k", athleteId: "i12345" })
    ).not.toThrow();
  });
});

describe("createServices pinned today", () => {
  const TODAY = "2026-09-06";

  function pinnedServices() {
    const urls: string[] = [];
    const fetchFn = async (input: Parameters<typeof fetch>[0]) => {
      const url = String(input);
      urls.push(url);
      const body = /\/athlete\/i1$/.test(new URL(url).pathname)
        ? { id: "i1", sportSettings: [] }
        : [];
      return new Response(JSON.stringify(body), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    };
    const services = createServices({
      apiKey: "k",
      athleteId: "i1",
      fetchFn,
      today: () => TODAY,
    });
    return { services, urls };
  }

  it("anchors the coaching context's window on the pinned day", async () => {
    const { services, urls } = pinnedServices();
    const ctx = await services.coachingContext.getCoachingContext();
    expect(ctx.asOf).toBe(TODAY);
    const wellness = urls.find((u) => u.includes("/wellness?"));
    expect(new URL(wellness!).searchParams.get("newest")).toBe(TODAY);
  });

  it("looks back for MAP from the pinned day when profiling power", async () => {
    const { services, urls } = pinnedServices();
    await services.powerProfile.computePowerProfile().catch(() => undefined);
    const activities = urls.find((u) => u.includes("/activities?"));
    expect(new URL(activities!).searchParams.get("newest")).toBe(TODAY);
  });

  it("answers FTP from one athlete request, without the coaching context", async () => {
    const { services, urls } = pinnedServices();
    await services.anchors.getAthleteAnchors();
    expect(urls.map((u) => new URL(u).pathname)).toEqual([
      "/api/v1/athlete/i1",
    ]);
  });

  it("builds no coaching context for the execution digest", async () => {
    const { services, urls } = pinnedServices();
    await services.executionReview.getExecutionDigest({
      oldest: "2026-09-01",
      newest: "2026-09-06",
    });
    expect(urls.some((u) => u.includes("/wellness"))).toBe(false);
    expect(urls.some((u) => u.includes("/power-curves"))).toBe(false);
  });

  it("keeps an explicit coaching-context today over the pinned one", async () => {
    const { services } = pinnedServices();
    const ctx = await services.coachingContext.getCoachingContext({
      today: "2026-08-01",
    });
    expect(ctx.asOf).toBe("2026-08-01");
  });
});

import { describe, it, expect, vi } from "vitest";
import { createServices } from "../../../src/index.js";
import {
  MAX_TREND_WEEKS,
  type MiddleBandFigures,
} from "../../../src/services/training-load/index.js";

// Three weeks: an FTP change inside the first, nothing power-recorded in the
// second, and a ride whose stream came back empty in the third.
const ACTIVITIES = [
  ride("a1", "2026-08-03T07:00:00", "Ride", { icu_ftp: 280 }),
  ride("a2", "2026-08-05T18:00:00", "VirtualRide"), // athlete FTP, 300
  { id: "a3", start_date_local: "2026-08-06T12:00:00", type: "WeightTraining" },
  { id: "a4", start_date_local: "2026-08-12T12:00:00", type: "WeightTraining" },
  ride("a5", "2026-08-18T07:00:00", "Ride", { icu_ftp: 300 }),
  ride("a6", "2026-08-20T07:00:00", "Ride", { icu_ftp: 300 }),
];

/** 10 min at 250 W and 10 min at 150 W: in the band at 280-300 W FTP, then below it. */
const WATTS = [...Array(600).fill(250), ...Array(600).fill(150)];
const STREAMS: Record<string, number[]> = {
  a1: WATTS,
  a2: [...Array(1200).fill(260), ...Array(300).fill(100)],
  a5: WATTS,
  a6: [],
};

function ride(
  id: string,
  start: string,
  type: string,
  extra: Record<string, unknown> = {}
) {
  return {
    id,
    start_date_local: start,
    type,
    icu_average_watts: 200,
    moving_time: 3600,
    ...extra,
  };
}

function build(athleteFtp: number | null = 300) {
  const fetchFn = vi.fn(async (url: string) => {
    const path = new URL(url).pathname;
    const query = new URL(url).searchParams;
    let body: unknown;
    const stream = /\/activity\/([^/]+)\/streams\.json$/.exec(path);
    if (stream) {
      body = [{ type: "watts", data: STREAMS[stream[1]] ?? [] }];
    } else if (path.endsWith("/activities")) {
      const oldest = query.get("oldest")!;
      const newest = query.get("newest")!;
      body = ACTIVITIES.filter((a) => {
        const date = a.start_date_local.slice(0, 10);
        return date >= oldest && date <= newest;
      });
    } else if (path.endsWith("/wellness") || path.endsWith("/events")) {
      body = [];
    } else {
      body = {
        id: "i1",
        sportSettings: [{ types: ["Ride", "VirtualRide"], ftp: athleteFtp }],
      };
    }
    return {
      ok: true,
      status: 200,
      statusText: "OK",
      headers: new Headers({ "content-type": "application/json" }),
      json: () => Promise.resolve(body),
      text: () => Promise.resolve(JSON.stringify(body)),
    } as unknown as Response;
  });
  const services = createServices({
    apiKey: "k",
    athleteId: "i1",
    fetchFn: fetchFn as never,
    today: () => "2026-09-06",
  });
  return { trainingLoad: services.trainingLoad, fetchFn };
}

function streamFetches(fetchFn: ReturnType<typeof vi.fn>): string[] {
  return fetchFn.mock.calls
    .map((c) => String(c[0]))
    .filter((u) => u.includes("/streams.json"));
}

describe("TrainingLoad.getMiddleBandTrend", () => {
  it("gives, for every week, exactly the week summary's middle band", async () => {
    const { trainingLoad } = build();
    const trend = await trainingLoad.getMiddleBandTrend({
      oldest: "2026-08-03",
      newest: "2026-08-23",
    });
    expect(trend.weeks.map((w) => w.weekStart)).toEqual([
      "2026-08-03",
      "2026-08-10",
      "2026-08-17",
    ]);

    for (const row of trend.weeks) {
      const { middleBand } = await build().trainingLoad.summarizeWeek(
        row.weekStart
      );
      const { weekStart: _s, weekEnd: _e, rides: _r, ...figures } = row;
      if (middleBand === null) {
        expect(figures).toEqual({
          seconds: 0,
          hours: 0,
          fractionOfPowerTime: null,
          ftpRange: null,
          excludedNoFtp: 0,
        });
      } else {
        const { lowPctFtp, highPctFtp, ...band } = middleBand;
        expect(figures).toEqual(band);
        expect(trend.band).toEqual({ lowPctFtp, highPctFtp });
      }
    }
  });

  it("measures each ride against its own FTP and notes a week that spans a change", async () => {
    const { trainingLoad } = build();
    const { weeks } = await trainingLoad.getMiddleBandTrend({
      oldest: "2026-08-03",
      newest: "2026-08-09",
    });
    expect(weeks).toHaveLength(1);
    expect(weeks[0]).toMatchObject({
      ftpRange: { min: 280, max: 300 },
      rides: 2,
      // a1: 600 s at 250 W (in 213-297 W); a2: 1200 s at 260 W (in 228-318 W).
      seconds: 1800,
      fractionOfPowerTime: Math.round((1800 / 2700) * 1000) / 1000,
    });
    expect(weeks[0].note).toMatch(/week spans an FTP change \(280-300 W\)/);
  });

  it("reports a week with no power-recorded ride as zeros, not a missing row", async () => {
    const { trainingLoad } = build();
    const { weeks } = await trainingLoad.getMiddleBandTrend({
      oldest: "2026-08-10",
      newest: "2026-08-16",
    });
    expect(weeks).toEqual([
      {
        weekStart: "2026-08-10",
        weekEnd: "2026-08-16",
        seconds: 0,
        hours: 0,
        fractionOfPowerTime: null,
        ftpRange: null,
        excludedNoFtp: 0,
        rides: 0,
      },
    ]);
  });

  it("snaps to whole weeks and fetches the activities once, streams once per power ride", async () => {
    const { trainingLoad, fetchFn } = build();
    const trend = await trainingLoad.getMiddleBandTrend({
      oldest: "2026-08-05",
      newest: "2026-08-19",
    });
    expect(trend.oldest).toBe("2026-08-03");
    expect(trend.newest).toBe("2026-08-23");
    const activityCalls = fetchFn.mock.calls
      .map((c) => String(c[0]))
      .filter((u) => /\/activities\?/.test(u));
    expect(activityCalls).toHaveLength(1);
    expect(activityCalls[0]).toMatch(/oldest=2026-08-03&newest=2026-08-23/);
    expect(streamFetches(fetchFn).sort()).toEqual(
      ["a1", "a2", "a5", "a6"].map((id) => expect.stringContaining(`/${id}/`))
    );
  });

  it("totals the range as the sum of its weeks, with the band stated once", async () => {
    const { trainingLoad } = build();
    const trend = await trainingLoad.getMiddleBandTrend({
      oldest: "2026-08-03",
      newest: "2026-08-23",
    });
    const sum = (key: keyof MiddleBandFigures) =>
      trend.weeks.reduce((t, w) => t + (w[key] as number), 0);
    expect(trend.total.seconds).toBe(sum("seconds"));
    expect(trend.total.rides).toBe(sum("rides"));
    expect(trend.total.ftpRange).toEqual({ min: 280, max: 300 });
    expect(trend.total.note).toMatch(/range spans an FTP change/);
    expect(trend.band).toEqual({ lowPctFtp: 76, highPctFtp: 106 });
  });

  it("counts only the requested sport", async () => {
    const { trainingLoad, fetchFn } = build();
    const trend = await trainingLoad.getMiddleBandTrend({
      oldest: "2026-08-03",
      newest: "2026-08-09",
      sport: "VirtualRide",
    });
    expect(trend.sport).toBe("VirtualRide");
    expect(trend.weeks[0]).toMatchObject({
      rides: 1,
      seconds: 1200,
      ftpRange: { min: 300, max: 300 },
    });
    expect(trend.weeks[0].note).toBeUndefined();
    expect(streamFetches(fetchFn)).toHaveLength(1);
  });

  it("counts power rides with no FTP from any source as excluded", async () => {
    const { trainingLoad } = build(null);
    const { weeks } = await trainingLoad.getMiddleBandTrend({
      oldest: "2026-08-03",
      newest: "2026-08-09",
    });
    // a2 has no icu_ftp and the athlete has none either.
    expect(weeks[0]).toMatchObject({ excludedNoFtp: 1, rides: 1 });
  });

  it("accepts exactly the cap once snapped", async () => {
    const { trainingLoad } = build();
    const newest = new Date("2026-08-03T00:00:00Z");
    newest.setUTCDate(newest.getUTCDate() + MAX_TREND_WEEKS * 7 - 1);
    const trend = await trainingLoad.getMiddleBandTrend({
      oldest: "2026-08-03",
      newest: newest.toISOString().slice(0, 10),
    });
    expect(trend.weeks).toHaveLength(MAX_TREND_WEEKS);
  });

  it("refuses a range over the cap before fetching anything", async () => {
    const { trainingLoad, fetchFn } = build();
    const newest = new Date("2026-08-03T00:00:00Z");
    newest.setUTCDate(newest.getUTCDate() + MAX_TREND_WEEKS * 7);
    await expect(
      trainingLoad.getMiddleBandTrend({
        oldest: "2026-08-03",
        newest: newest.toISOString().slice(0, 10),
      })
    ).rejects.toThrow(new RegExp(`more than ${MAX_TREND_WEEKS} weeks`));
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("refuses a backwards range", async () => {
    const { trainingLoad } = build();
    await expect(
      trainingLoad.getMiddleBandTrend({
        oldest: "2026-08-23",
        newest: "2026-08-03",
      })
    ).rejects.toThrow(/must be on or after/);
  });
});

import { describe, it, expect } from "vitest";
import {
  createPairedSessionLoader,
  reviewWindow,
  MAX_WINDOW_DAYS,
} from "../../../src/services/paired-sessions/index.js";
import { createExecutionDigest } from "../../../src/services/execution-digest/index.js";
import { createIntensityDistribution } from "../../../src/services/intensity-distribution/index.js";
import {
  intervalsApis,
  requested,
  routedFetch,
  type Route,
} from "../../helpers/intervals-fixture.js";

const WORKOUT = (id: number, day: string) => ({
  id,
  name: `Event ${id}`,
  category: "WORKOUT",
  start_date_local: `${day}T00:00:00`,
});

const RIDE = (id: string, day: string, eventId: number | null) => ({
  id,
  name: `Ride ${id}`,
  start_date_local: `${day}T07:00:00`,
  paired_event_id: eventId,
});

function loader(routes: Route[]) {
  const fetchFn = routedFetch(routes);
  return {
    loader: createPairedSessionLoader(intervalsApis(fetchFn)),
    urls: () => requested(fetchFn),
  };
}

describe("reviewWindow — the one guard", () => {
  it("counts both ends", () => {
    expect(reviewWindow("2026-09-01", "2026-09-01").days).toBe(1);
    expect(reviewWindow("2026-09-01", "2026-09-28").days).toBe(MAX_WINDOW_DAYS);
  });

  it("refuses a 29-day window", () => {
    expect(() => reviewWindow("2026-09-01", "2026-09-29")).toThrow(
      /spans 29 days, over the 28-day maximum/
    );
  });

  it("refuses a window that ends before it starts", () => {
    expect(() => reviewWindow("2026-09-02", "2026-09-01")).toThrow(
      /ends before it starts/
    );
  });

  it("refuses a date that is not YYYY-MM-DD", () => {
    expect(() => reviewWindow("2026-9-1", "2026-09-10")).toThrow(/YYYY-MM-DD/);
  });

  /**
   * Regression: the digest counted days exclusively and the distribution
   * inclusively against the same cap, so a 29-day window passed the digest's
   * guard and then threw inside the distribution it called.
   */
  it("rejects a 29-day window identically in every lens that takes one", async () => {
    const apis = intervalsApis(routedFetch([]));
    const getCoachingZones = async () => ({ zones: null, ftp: 300 });
    const digest = createExecutionDigest({
      ...apis,
      getFtp: async () => 300,
      getCoachingZones,
    });
    const distribution = createIntensityDistribution({
      ...apis,
      getCoachingZones,
    });
    const window = { oldest: "2026-09-01", newest: "2026-09-29" };
    const refusal = /spans 29 days, over the 28-day maximum/;

    await expect(digest.getExecutionDigest(window)).rejects.toThrow(refusal);
    await expect(
      distribution.compareIntensityDistributionRange(window)
    ).rejects.toThrow(refusal);
  });
});

describe("PairedSessionLoader.loadWindow — pairing once", () => {
  const WINDOW = { oldest: "2026-09-01", newest: "2026-09-14" };

  it("refuses a window over the cap before any fetch", async () => {
    const { loader: l, urls } = loader([]);
    await expect(
      l.loadWindow({ oldest: "2026-08-01", newest: "2026-09-14" })
    ).rejects.toThrow(/28-day maximum/);
    expect(urls()).toEqual([]);
  });

  it("pairs an event on the window's edge to a ride just past it", async () => {
    const { loader: l, urls } = loader([
      [/\/events\?/, [WORKOUT(1, "2026-09-14")]],
      [/\/activities\?/, [RIDE("i1", "2026-09-15", 1)]],
    ]);

    const loaded = await l.loadWindow(WINDOW);

    expect(loaded.sessions.map((s) => s.activity.id)).toEqual(["i1"]);
    expect(loaded.unriddenEvents).toEqual([]);
    expect(loaded.lookup(1).session?.activity.id).toBe("i1");
    expect(urls().find((u) => u.includes("/activities?"))).toContain(
      "oldest=2026-08-30&newest=2026-09-16"
    );
  });

  it("fetches, once, the event of a ride in the window paired outside it", async () => {
    const { loader: l, urls } = loader([
      [/\/events\?/, []],
      [/\/events\/9$/, WORKOUT(9, "2026-08-25")],
      [
        /\/activities\?/,
        [RIDE("i1", "2026-09-02", 9), RIDE("i2", "2026-09-03", 9)],
      ],
    ]);

    const loaded = await l.loadWindow(WINDOW);

    expect(loaded.sessions.map((s) => s.event.id)).toEqual([9]);
    expect(urls().filter((u) => u.endsWith("/events/9"))).toHaveLength(1);
  });

  it("names the halves: unpaired rides in the window, unridden workouts", async () => {
    const { loader: l } = loader([
      [
        /\/events\?/,
        [
          WORKOUT(1, "2026-09-05"),
          { id: 2, category: "NOTE", start_date_local: "2026-09-06T00:00:00" },
        ],
      ],
      [
        /\/activities\?/,
        [RIDE("i1", "2026-09-05", null), RIDE("i0", "2026-08-31", null)],
      ],
    ]);

    const loaded = await l.loadWindow(WINDOW);

    // The ride before the window was listed only for its reach.
    expect(loaded.unpairedRides.map((u) => u.activity?.id)).toEqual(["i1"]);
    expect(loaded.unriddenEvents.map((u) => u.event?.id)).toEqual([1]);
    expect(loaded.lookup(1)).toMatchObject({ reason: "no-paired-activity" });
  });
});

describe("PairedSession — each ride read fetched once", () => {
  it("memoises the ride's intervals, laps and streams", async () => {
    const { loader: l, urls } = loader([
      [/\/events\/1$/, WORKOUT(1, "2026-09-05")],
      [/\/activities\?/, [RIDE("i1", "2026-09-05", 1)]],
      [/\/activity\/i1\/file$/, null],
      [
        /\/activity\/i1\/streams\.json/,
        { watts: [200, null, 210], time: [0, 1, 2] },
      ],
      [
        /\/activity\/i1/,
        {
          ...RIDE("i1", "2026-09-05", 1),
          icu_intervals: [
            { start_time: 0, elapsed_time: 3, average_watts: 205 },
          ],
        },
      ],
    ]);

    const found = await l.find({ eventId: 1 });
    const session = found.session!;

    await Promise.all([session.streams(), session.streams()]);
    await session.executionRecord();
    await session.executionRecord();
    await session.detail();

    const reads = urls().filter((u) => u.includes("/activity/i1"));
    expect(reads).toHaveLength(3);
    // A dropout stays a gap: typed, and passed through, as null.
    expect((await session.streams()).watts).toEqual([200, null, 210]);
  });

  it("does not refetch the ride it was found from", async () => {
    const full = { ...RIDE("i1", "2026-09-05", 1), icu_intervals: [] };
    const { loader: l, urls } = loader([
      [/\/events\/1$/, WORKOUT(1, "2026-09-05")],
      [/\/activity\/i1/, full],
    ]);

    const found = await l.find({ activityId: "i1" });
    await found.session!.detail();

    expect(urls().filter((u) => u.includes("/activity/i1"))).toHaveLength(1);
  });
});

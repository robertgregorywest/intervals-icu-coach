import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createExecutionReview } from "../../../../src/services/execution-review/index.js";
import { pinnedAnchors } from "../../../helpers/anchors.js";
import { digestSession } from "../../../../src/services/execution-review/digest/digest.js";
import { readPlannedSteps } from "../../../helpers/planned-steps.js";
import type {
  PlannedVsActualResult,
  AlignedStep,
} from "../../../../src/services/execution-review/steps/types.js";
import type { IntervalsEvent, PlannedDocStep } from "../../../../src/types.js";
import type { Activity } from "../../../../src/services/activities/index.js";
import {
  intervalsApis,
  requested,
  routedFetch,
} from "../../../helpers/intervals-fixture.js";

/** A pinned MAP-zone frame, so the dose does not move with the athlete's MAP. */
const MAP_ZONES = JSON.parse(
  readFileSync(
    fileURLToPath(
      new URL(
        "../../../fixtures/intensity-distribution/coaching-zones.json",
        import.meta.url
      )
    ),
    "utf8"
  )
).mapZones;

const FTP = 300;
/** 88% of 300 W — the key-session floor these fixtures are built around. */
const FLOOR = 264;

function event(
  id: number,
  name: string,
  steps: PlannedDocStep[],
  date = "2026-09-08"
): IntervalsEvent {
  return {
    id,
    name,
    category: "WORKOUT",
    type: "Ride",
    start_date_local: `${date}T00:00:00`,
    description: "",
    icu_ftp: FTP,
    workout_doc: { steps },
  } as IntervalsEvent;
}

function step(
  text: string,
  watts: number,
  duration = 300,
  cadence?: number
): PlannedDocStep {
  return {
    text,
    duration,
    power: { units: "w", value: watts },
    ...(cadence ? { cadence: { units: "rpm", value: cadence } } : {}),
  } as PlannedDocStep;
}

/** One ridden segment: seconds at a steady wattage and cadence. */
interface Segment {
  seconds: number;
  watts: number;
  cadence?: number;
}

/**
 * A ride paired to `eventId`, recorded as `segments`. Its detected intervals
 * and its power stream are both built from the segments, so the step lens and
 * the band lens read the same ride.
 */
function ride(
  id: string,
  eventId: number | null,
  segments: Segment[],
  over: Partial<Activity> = {}
): Ride {
  let start = 0;
  const intervals = segments.map((seg) => {
    const iv = {
      type: "WORK",
      start_time: start,
      elapsed_time: seg.seconds,
      average_watts: seg.watts,
      average_cadence: seg.cadence,
    };
    start += seg.seconds;
    return iv;
  });
  const watts = segments.flatMap((seg) => Array(seg.seconds).fill(seg.watts));
  return {
    activity: {
      id,
      name: `Ride ${id}`,
      type: "Ride",
      start_date_local: "2026-09-08T07:00:00",
      paired_event_id: eventId,
      icu_ftp: FTP,
      icu_intervals: intervals,
      ...over,
    } as unknown as Activity,
    streams: { watts, time: watts.map((_, i) => i) },
  };
}

interface Ride {
  activity: Activity;
  streams: { watts?: number[]; time?: number[] };
}

interface World {
  events: IntervalsEvent[];
  rides?: Ride[];
  /** The athlete's FTP; `null` for none resolving. */
  ftp?: number | null;
}

/**
 * The digest over the real lenses, behind a routed Intervals.icu. No lap files
 * exist, so every ride is read from its detected intervals.
 */
function digest(world: World) {
  const rides = world.rides ?? [];
  const byId = (url: string) =>
    rides.find((r) => url.includes(`/activity/${r.activity.id}`));
  const fetchFn = routedFetch([
    [/\/activity\/[^/]+\/file$/, null],
    [/\/activity\/[^/]+\/streams\.json/, (url: string) => byId(url)?.streams],
    [/\/activity\//, (url: string) => byId(url)?.activity],
    // The list payload carries the pairing and the FTP, not the intervals.
    [
      /\/activities\?/,
      rides.map(({ activity }) => ({ ...activity, icu_intervals: undefined })),
    ],
    [/\/events\?/, world.events],
    [
      /\/events\/\d+$/,
      (url: string) =>
        world.events.find((e) => url.endsWith(`/events/${e.id}`)) ?? null,
    ],
  ]);

  let athleteFtpReads = 0;
  const athleteFtp = world.ftp === undefined ? FTP : world.ftp;
  const service = createExecutionReview({
    ...intervalsApis(fetchFn),
    anchors: pinnedAnchors({
      athlete: async () => {
        athleteFtpReads++;
        return { ftp: athleteFtp };
      },
      map: async () => ({ map: null, mapZones: MAP_ZONES }),
    }),
  });

  return {
    service,
    urls: () => requested(fetchFn),
    athleteFtpReads: () => athleteFtpReads,
  };
}

const WINDOW = { oldest: "2026-09-01", newest: "2026-09-17" };

describe("getExecutionDigest — the window", () => {
  it("refuses a window longer than one block, before any fetch", async () => {
    const { service, urls } = digest({ events: [] });
    await expect(
      service.getExecutionDigest({ oldest: "2026-08-01", newest: "2026-09-17" })
    ).rejects.toThrow(/over the 28-day maximum/);
    expect(urls()).toEqual([]);
  });

  it("counts the window inclusively: 28 days pass, 29 do not", async () => {
    const { service } = digest({ events: [] });
    await expect(
      service.getExecutionDigest({ oldest: "2026-09-01", newest: "2026-09-28" })
    ).resolves.toMatchObject({ status: "skipped" });
    await expect(
      service.getExecutionDigest({ oldest: "2026-09-01", newest: "2026-09-29" })
    ).rejects.toThrow(/spans 29 days, over the 28-day maximum/);
  });

  it("refuses a window that ends before it starts", async () => {
    const { service } = digest({ events: [] });
    await expect(
      service.getExecutionDigest({ oldest: "2026-09-17", newest: "2026-09-01" })
    ).rejects.toThrow(/ends before it starts/);
  });
});

describe("getExecutionDigest — selecting key sessions", () => {
  it("skips a window holding no key session, and leaves the watermark alone", async () => {
    const { service, urls } = digest({
      events: [
        event(1, "Endurance", [step("Endurance", 200)]),
        event(2, "Recovery spin", [step("Recovery", 150)]),
      ],
    });

    const result = await service.getExecutionDigest(WINDOW);

    expect(result.status).toBe("skipped");
    expect(result.reviewedThrough).toBeUndefined();
    expect(result.nonKeySessions).toBe(2);
    expect(result.sessions).toEqual([]);
    // A skip costs the two listings and nothing else: neither lens is run.
    expect(urls()).toHaveLength(2);
  });

  it("selects on a declared work step, not on any step reaching the floor", async () => {
    // The warm-up ramp tops out above the floor. It declares no role, so it
    // cannot pull an endurance ride into the review.
    const { service } = digest({
      events: [
        event(1, "Endurance with a hard warm-up", [
          step("Ramp 6", FLOOR + 40, 60),
          step("Endurance", 200, 3600),
        ]),
        event(2, "Threshold 2×15", [step("Threshold", FLOOR + 10, 900)]),
      ],
    });

    const result = await service.getExecutionDigest(WINDOW);

    expect(result.status).toBe("reviewed");
    expect(result.reviewedThrough).toBe("2026-09-17");
    expect(result.sessions.map((s) => s.eventId)).toEqual([2]);
    expect(result.nonKeySessions).toBe(1);
  });

  it("leaves a work step below the floor out of the selection", async () => {
    const { service } = digest({
      events: [event(1, "Tempo", [step("Tempo", FLOOR - 20, 900)])],
    });
    expect((await service.getExecutionDigest(WINDOW)).status).toBe("skipped");
  });

  it("selects a key session that was never ridden, rather than missing it", async () => {
    const { service } = digest({
      events: [event(1, "Team track", [step("Sprint", 700, 20)])],
    });

    const [session] = (await service.getExecutionDigest(WINDOW)).sessions;
    expect(session!.reason).toBe("no-paired-activity");
    expect(session!.alignmentBasis).toBe("none");
    expect(session!.flagged).toEqual([]);
  });

  it("falls back to athlete FTP for an event carrying none", async () => {
    const bare = event(1, "Threshold", [step("Threshold", FLOOR + 10, 900)]);
    delete (bare as { icu_ftp?: number | null }).icu_ftp;

    const { service, athleteFtpReads } = digest({ events: [bare] });
    const result = await service.getExecutionDigest(WINDOW);
    expect(result.sessions.map((s) => s.eventId)).toEqual([1]);
    // Read once however many lenses fall back to it.
    expect(athleteFtpReads()).toBe(1);
  });

  it("reads a plan at its paired ride's FTP, as the review does", async () => {
    // 274 W clears 88% of the athlete's 300 W but not of the 320 W the ride
    // was recorded at — the FTP the review will judge this plan against.
    const bare = event(1, "Threshold", [step("Threshold", FLOOR + 10, 900)]);
    delete (bare as { icu_ftp?: number | null }).icu_ftp;

    const { service, athleteFtpReads } = digest({
      events: [bare],
      rides: [ride("i1", 1, [{ seconds: 900, watts: 274 }], { icu_ftp: 320 })],
    });

    expect((await service.getExecutionDigest(WINDOW)).status).toBe("skipped");
    expect(athleteFtpReads()).toBe(0);
  });

  it("looks for paired rides as far past the window as the review does", async () => {
    const { service, urls } = digest({ events: [] });
    await service.getExecutionDigest(WINDOW);
    expect(urls().find((u) => u.includes("/activities?"))).toContain(
      "oldest=2026-08-30&newest=2026-09-19"
    );
  });

  it("skips rather than guesses when no FTP resolves at all", async () => {
    const bare = event(1, "Threshold", [step("Threshold", FLOOR + 10, 900)]);
    delete (bare as { icu_ftp?: number | null }).icu_ftp;

    const { service } = digest({ events: [bare], ftp: null });
    expect((await service.getExecutionDigest(WINDOW)).status).toBe("skipped");
  });
});

describe("getExecutionDigest — both lenses over one ride", () => {
  // 274 W is inside the 228–318 W middle band at FTP 300.
  const threshold = event(1, "Threshold 2×10", [
    step("Warm-up", 150, 600),
    step("Threshold", 274, 600, 90),
    step("Recovery", 150, 300),
    step("Threshold", 274, 600, 90),
  ]);
  const ridden = ride("i1", 1, [
    { seconds: 600, watts: 150, cadence: 88 },
    // Rep 1 is 12% under its target; rep 2 hits it but at 75 rpm.
    { seconds: 600, watts: 240, cadence: 90 },
    { seconds: 300, watts: 150, cadence: 85 },
    { seconds: 600, watts: 275, cadence: 75 },
  ]);

  it("flags the reps that missed, on power and on cadence", async () => {
    const { service } = digest({ events: [threshold], rides: [ridden] });

    const [session] = (await service.getExecutionDigest(WINDOW)).sessions;
    expect(session).toMatchObject({
      eventId: 1,
      activityId: "i1",
      executionRecord: "detected-intervals",
      alignmentBasis: "sequential",
      workSteps: 2,
      unclassifiedSteps: 2,
      cadence: { judged: 2, missed: 1 },
    });
    expect(
      session!.flagged.map((f) => [f.index, f.verdict, f.cadenceVerdict])
    ).toEqual([
      [1, "under", "on-target"],
      [3, "on-target", "under"],
    ]);
  });

  it("joins each session to its own middle-band dose", async () => {
    const { service } = digest({ events: [threshold], rides: [ridden] });

    const result = await service.getExecutionDigest(WINDOW);
    // Both reps sit in the band as planned and as ridden; nothing else does.
    expect(result.middleBand).toMatchObject({
      plannedSeconds: 1200,
      deliveredSeconds: 1200,
    });
    expect(result.sessions[0]).toMatchObject({
      middleBandPlannedSeconds: 1200,
      middleBandDeliveredSeconds: 1200,
      middleBandDeliveredFraction: 1,
    });
  });

  it("fetches each event and ride at most once across both lenses", async () => {
    const second = event(
      2,
      "Threshold again",
      threshold.workout_doc!.steps as PlannedDocStep[],
      "2026-09-10"
    );
    const { service, urls } = digest({
      events: [threshold, second],
      rides: [
        ridden,
        ride("i2", 2, [{ seconds: 2100, watts: 250 }], {
          start_date_local: "2026-09-10T07:00:00",
        }),
      ],
    });

    const result = await service.getExecutionDigest(WINDOW);
    expect(result.sessions).toHaveLength(2);

    const seen = urls().map((u) => u.replace(/^https:\/\/intervals\.icu/, ""));
    expect(new Set(seen).size).toBe(seen.length);
    // One listing of each side; per ride its intervals, laps and streams.
    expect(seen.filter((u) => u.includes("/events"))).toHaveLength(1);
    expect(seen.filter((u) => u.includes("/activities?"))).toHaveLength(1);
    for (const id of ["i1", "i2"]) {
      expect(seen.filter((u) => u.includes(`/activity/${id}`))).toHaveLength(3);
    }
  });

  it("keeps the excluded sessions but drops their prose", async () => {
    const { service } = digest({
      events: [
        threshold,
        event(7, "Endurance", [step("Endurance", 200, 3600)], "2026-09-12"),
      ],
      rides: [
        ridden,
        ride("i9", null, [{ seconds: 1800, watts: 180 }], {
          name: "Commute",
          start_date_local: "2026-09-11T08:00:00",
        }),
      ],
    });

    const { excluded } = await service.getExecutionDigest(WINDOW);
    expect(excluded).toEqual([
      {
        date: "2026-09-11T08:00:00",
        activityId: "i9",
        name: "Commute",
        reason: "no-paired-event",
      },
      {
        date: "2026-09-12T00:00:00",
        eventId: 7,
        name: "Endurance",
        reason: "no-paired-activity",
      },
    ]);
  });
});

describe("digestSession — the mechanical filter", () => {
  const key = event(1, "Threshold 3×10", [
    step("Warm-up", 150, 600),
    step("Threshold", FLOOR + 10, 600, 90),
    step("Recovery", 150, 300),
    step("Threshold", FLOOR + 10, 600, 90),
    step("Recovery", 150, 300),
  ]);
  const planned = readPlannedSteps(key.workout_doc, { ftp: FTP });

  function aligned(
    over: Partial<AlignedStep> & { index: number }
  ): AlignedStep {
    return {
      planned: {},
      verdict: "on-target",
      verdictBasis: "average-watts",
      ...over,
    } as AlignedStep;
  }

  /** The filter over one review of `key` whose steps came back as `steps`. */
  function filter(steps: AlignedStep[]) {
    return digestSession(
      {
        eventId: 1,
        tolerance: 0.05,
        executionRecord: "device-laps",
        alignmentBasis: "sequential",
        matchedFraction: 1,
        steps,
        rollup: { unplannedIntervals: [] },
      } as PlannedVsActualResult,
      planned,
      new Map()
    );
  }

  it("judges only the declared work steps, and counts the rest", () => {
    const session = filter([
      // Every support step reads `under` — a warm-up ridden easy and
      // recovery taken as easily as prescribed.
      aligned({ index: 0, verdict: "under", deltas: { watts: -20 } }),
      aligned({ index: 1, verdict: "under", deltas: { watts: -18 } }),
      aligned({ index: 2, verdict: "under", deltas: { watts: -30 } }),
      aligned({ index: 3 }),
      aligned({ index: 4, verdict: "under", deltas: { watts: -25 } }),
    ]);

    expect(session.workSteps).toBe(2);
    expect(session.unclassifiedSteps).toBe(3);
    expect(session.flagged.map((f) => f.index)).toEqual([1]);
  });

  it("drops a band step outside its own band by less than noise", () => {
    const session = filter([
      aligned({
        index: 1,
        planned: { target: { low: 260, high: 280 } },
        verdict: "under",
        deltas: { watts: -4, wattsFraction: -0.015 },
      }),
      aligned({
        index: 3,
        planned: { target: { low: 260, high: 280 } },
        verdict: "under",
        deltas: { watts: -18, wattsFraction: -0.07 },
      }),
    ]);

    expect(session.flagged.map((f) => f.index)).toEqual([3]);
  });

  it("keeps a point-target miss whatever its size — tolerance already judged it", () => {
    const session = filter([
      aligned({
        index: 1,
        planned: { target: { watts: 270 } },
        verdict: "under",
        deltas: { watts: -15, wattsFraction: -0.055 },
      }),
    ]);

    expect(session.flagged).toHaveLength(1);
  });

  it("flags a rep that met its power and missed its cadence", () => {
    const session = filter([
      aligned({
        index: 1,
        verdict: "on-target",
        cadenceVerdict: "under",
        deltas: { watts: 0, cadence: -15 },
      }),
      aligned({ index: 3, verdict: "on-target", cadenceVerdict: "on-target" }),
    ]);

    expect(session.flagged.map((f) => f.index)).toEqual([1]);
    expect(session.cadence).toEqual({ judged: 2, missed: 1 });
  });

  it("rolls cadence up across the work steps, so a session-wide miss reads as one", () => {
    const session = filter([
      aligned({ index: 0, cadenceVerdict: "under" }),
      aligned({ index: 1, cadenceVerdict: "under" }),
      aligned({ index: 3, cadenceVerdict: "under" }),
    ]);

    // Step 0 is the warm-up: its cadence verdict is not part of the roll-up.
    expect(session.cadence).toEqual({ judged: 2, missed: 2 });
  });

  it("keeps an unmatched or not-attempted work step", () => {
    const session = filter([
      aligned({ index: 1, verdict: "unmatched" }),
      aligned({ index: 3, verdict: "not-attempted" }),
    ]);

    expect(session.flagged.map((f) => f.verdict)).toEqual([
      "unmatched",
      "not-attempted",
    ]);
  });

  it("carries a coasting fraction only where it qualifies the reading", () => {
    const [first, second] = filter([
      aligned({
        index: 1,
        verdict: "under",
        verdictBasis: "normalized-power",
        planned: { target: { watts: 270 } },
        delivered: {
          intervalIndex: 1,
          durationSeconds: 600,
          coastingFraction: 0.12,
        },
      }),
      aligned({
        index: 3,
        verdict: "under",
        planned: { target: { watts: 270 } },
        delivered: {
          intervalIndex: 3,
          durationSeconds: 600,
          coastingFraction: 0.01,
        },
      }),
    ]).flagged;

    expect(first!.coastingFraction).toBe(0.12);
    expect(second!.coastingFraction).toBeUndefined();
  });

  it("carries no step label — a label here runs to a paragraph of prose", () => {
    const [flagged] = filter([
      aligned({
        index: 1,
        label: "Threshold. Sit at the top of sweet spot and hold it even.",
        verdict: "under",
        planned: { target: { watts: 270 } },
      }),
    ]).flagged;

    expect(flagged).not.toHaveProperty("label");
  });
});

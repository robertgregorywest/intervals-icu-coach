import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  intervalsApis,
  routedFetch,
  type RoutedFetch,
} from "../../helpers/intervals-fixture.js";
import {
  IntensityDistribution,
  MAX_RANGE_DAYS,
} from "../../../src/services/intensity-distribution/intensity-distribution.js";
import type { ZoneRow } from "../../../src/services/athlete-anchors/index.js";
import { createAthleteAnchorsFrom } from "../../../src/services/athlete-anchors/index.js";

function fixture(name: string) {
  const path = fileURLToPath(
    new URL(
      `../../fixtures/intensity-distribution/${name}.json`,
      import.meta.url
    )
  );
  return JSON.parse(readFileSync(path, "utf8"));
}

/** Pinned so expected seconds do not move when the athlete's MAP does. */
const FRAME = fixture("coaching-zones") as {
  ftp: number;
  mapZones: ZoneRow[];
};

function build(
  fetchFn: RoutedFetch,
  zones: Partial<{ zones: ZoneRow[] | null; ftp: number | null }> = {}
) {
  return new IntensityDistribution({
    ...intervalsApis(fetchFn),
    anchors: createAthleteAnchorsFrom({
      athlete: async () => ({
        ftp: zones.ftp !== undefined ? zones.ftp : FRAME.ftp,
      }),
      map: async () => ({
        map: null,
        mapZones: zones.zones !== undefined ? zones.zones : FRAME.mapZones,
      }),
    }),
  });
}

/** Routes for one paired session, streams included. */
function sessionRoutes(name: string): Array<[RegExp, unknown]> {
  const f = fixture(name);
  return [
    [/\/streams\.json/, { watts: f.streams.watts ?? undefined }],
    [/\/activity\//, f.activity],
    [/\/events?\//, f.event],
  ];
}

const seconds = (
  r: {
    zones?: Array<{
      zone: string;
      plannedSeconds: number;
      deliveredSeconds: number;
    }>;
  },
  zone: string
) => r.zones?.find((z) => z.zone === zone);

describe("IntensityDistribution — argument handling", () => {
  it("rejects both identifiers together, before any HTTP", async () => {
    const fetchFn = routedFetch([]);
    await expect(
      build(fetchFn).compareIntensityDistribution({
        activityId: "i1",
        eventId: 2,
      })
    ).rejects.toThrow(/exactly one/);
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("rejects neither identifier", async () => {
    await expect(
      build(routedFetch([])).compareIntensityDistribution({})
    ).rejects.toThrow(/exactly one/);
  });
});

describe("IntensityDistribution — the clean paired case", () => {
  /**
   * Hand-computed from `sweet-spot-3x12`'s own steps against the pinned frame:
   *   warm-up   720 s @ 160–205 W (mid 182.5) → L1
   *   3× SST    720 s @ 255–275 W (mid 265)   → L3   = 2160 s
   *   3× recov  240 s @ 160 W                 → REC  =  720 s
   *   cooldown  600 s @ 145 W                 → REC
   */
  it("buckets the prescription as hand-computed from its steps", async () => {
    const result = await build(
      routedFetch(sessionRoutes("sweet-spot-3x12"))
    ).compareIntensityDistribution({ activityId: "i170317118" });

    expect(result.reason).toBeUndefined();
    expect(seconds(result, "REC")?.plannedSeconds).toBe(1320);
    expect(seconds(result, "L1")?.plannedSeconds).toBe(720);
    expect(seconds(result, "L3")?.plannedSeconds).toBe(2160);
    expect(result.plannedTotalSeconds).toBe(4200);
  });

  it("reports the middle band from its own bounds, not by summing zones", async () => {
    const result = await build(
      routedFetch(sessionRoutes("sweet-spot-3x12"))
    ).compareIntensityDistribution({ activityId: "i170317118" });

    // 76–106% of FTP 290.
    expect(result.middleBand).toMatchObject({ lowW: 220, highW: 307 });
    // Only the three SST reps sit inside it — not the L1 warm-up, which the
    // zone breakdown counts and the band does not.
    expect(result.middleBand?.plannedSeconds).toBe(2160);
    expect(result.middleBand?.deliveredSeconds).toBe(2033);
    expect(result.middleBand?.deliveredFraction).toBeCloseTo(0.941, 3);
  });

  it("records that the SST range straddled a band boundary", async () => {
    const result = await build(
      routedFetch(sessionRoutes("sweet-spot-3x12"))
    ).compareIntensityDistribution({ activityId: "i170317118" });

    // The three SST reps at 255–275 W span L3 (249–270) and L4 (270–291); the
    // midpoint puts each in L3. The warm-up at 160–205 W straddles REC/L1 the
    // same way, so four steps are flagged, not three — an authored range being
    // wider than a band is the common case, which is why it is reported rather
    // than treated as exceptional.
    expect(result.boundarySpanningSteps).toHaveLength(4);
    const sst = result.boundarySpanningSteps.filter((s) => s.lowW === 255);
    expect(sst).toHaveLength(3);
    expect(sst[0]).toMatchObject({
      lowW: 255,
      highW: 275,
      midpointW: 265,
      assignedZone: "L3",
    });
  });

  it("reports the partition it used, not the overlapping coaching bands", async () => {
    const result = await build(
      routedFetch(sessionRoutes("sweet-spot-3x12"))
    ).compareIntensityDistribution({ activityId: "i170317118" });

    const l2 = result.boundaries?.find((b) => b.name === "L2");
    // The coaching L2 runs to 270 W and overlaps L3; the partition's stops at
    // L3's floor so no second is counted twice.
    expect(l2).toMatchObject({ lowW: 208, highW: 249, coachingHighW: 270 });
    expect(result.boundaries?.at(-1)?.highW).toBeUndefined();
  });

  it("never counts a wattage in two zones", async () => {
    const result = await build(
      routedFetch(sessionRoutes("sweet-spot-3x12"))
    ).compareIntensityDistribution({ activityId: "i170317118" });

    const summed = (result.zones ?? []).reduce(
      (n, z) => n + z.deliveredSeconds,
      0
    );
    expect(summed).toBe(result.deliveredTotalSeconds);
    expect((result.zones ?? []).reduce((n, z) => n + z.plannedSeconds, 0)).toBe(
      result.plannedTotalSeconds
    );
  });
});

describe("IntensityDistribution — sessions the step lens refuses", () => {
  it("returns a full comparison for the track session", async () => {
    const result = await build(
      routedFetch(sessionRoutes("track-session"))
    ).compareIntensityDistribution({ activityId: "i171371339" });

    // The step lens declines to align this one; the band lens does not need to.
    expect(result.reason).toBeUndefined();
    expect(result.zones?.length).toBeGreaterThan(0);
    expect(result.middleBand).toBeDefined();
    expect(result.deliveredTotalSeconds).toBeGreaterThan(0);
  });

  it("sums delivered seconds to recording time, not elapsed time", async () => {
    const f = fixture("track-session");
    const result = await build(
      routedFetch(sessionRoutes("track-session"))
    ).compareIntensityDistribution({ activityId: "i171371339" });

    // 3322 samples against 7169 s elapsed: the pauses belong to no zone.
    expect(result.deliveredTotalSeconds).toBe(f.streams.watts.length);
    expect(result.deliveredTotalSeconds).toBeLessThan(f.activity.elapsed_time);
  });
});

describe("IntensityDistribution — dead ends name themselves", () => {
  it("names an unpaired activity", async () => {
    const f = fixture("sweet-spot-3x12");
    const result = await build(
      routedFetch([[/\/activity\//, { ...f.activity, paired_event_id: null }]])
    ).compareIntensityDistribution({ activityId: "i170317118" });

    expect(result.reason).toBe("no-paired-event");
    expect(result.zones).toBeUndefined();
  });

  it("names an event with no structured steps", async () => {
    const result = await build(
      routedFetch(sessionRoutes("no-structured-steps"))
    ).compareIntensityDistribution({ activityId: "i170317118" });

    expect(result.reason).toBe("no-structured-steps");
    expect(result.message).toMatch(/no structured workout steps/);
  });

  it("names an activity with no recorded power", async () => {
    const result = await build(
      routedFetch(
        sessionRoutes("sweet-spot-3x12").map(
          ([p, b]) =>
            (/streams/.test(String(p)) ? [p, {}] : [p, b]) as [RegExp, unknown]
        )
      )
    ).compareIntensityDistribution({ activityId: "i170317118" });

    expect(result.reason).toBe("no-recorded-power");
    expect(result.zones).toBeUndefined();
  });

  it("keeps the middle band when only the zone frame is missing", async () => {
    const result = await build(routedFetch(sessionRoutes("sweet-spot-3x12")), {
      zones: null,
    }).compareIntensityDistribution({ activityId: "i170317118" });

    expect(result.reason).toBe("no-coaching-zones");
    expect(result.zones).toBeUndefined();
    // The band's bounds are a percentage of FTP, so losing the zones does not
    // cost the figure the philosophy actually reads.
    expect(result.middleBand?.plannedSeconds).toBe(2160);
    expect(result.middleBand?.deliveredSeconds).toBe(2033);
  });
});

describe("IntensityDistribution — the prescription is the contract", () => {
  it("buckets the same session identically at a different FTP", async () => {
    const at = (ftp: number) =>
      build(routedFetch(sessionRoutes("sweet-spot-3x12")), {
        ftp,
      }).compareIntensityDistribution({ activityId: "i170317118" });

    const [low, high] = [await at(240), await at(330)];

    // Targets are absolute watts, so a threshold change between prescribing and
    // riding cannot move the planned distribution.
    expect(low.zones?.map((z) => z.plannedSeconds)).toEqual(
      high.zones?.map((z) => z.plannedSeconds)
    );
    // The middle band is FTP-anchored by definition, so it *should* move.
    expect(low.middleBand?.lowW).not.toBe(high.middleBand?.lowW);
  });
});

describe("IntensityDistribution — partition derivation", () => {
  it("refuses a zone model whose floors do not increase", async () => {
    const broken = [
      { ...FRAME.mapZones[0], lowW: 100 },
      { ...FRAME.mapZones[1], lowW: 100 },
    ] as ZoneRow[];

    await expect(
      build(routedFetch(sessionRoutes("sweet-spot-3x12")), {
        zones: broken,
      }).compareIntensityDistribution({ activityId: "i170317118" })
    ).rejects.toThrow(/strictly increasing floors/);
  });
});

describe("IntensityDistribution — range aggregation", () => {
  const listed = [
    { ...fixture("sweet-spot-3x12").activity },
    {
      id: "i999",
      name: "Unpaired commute",
      start_date_local: "2026-07-30T07:00:00",
      paired_event_id: null,
    },
  ];

  function rangeRoutes(): Array<[RegExp, unknown]> {
    const f = fixture("sweet-spot-3x12");
    return [
      [/\/activities\?/, listed],
      [/\/streams\.json/, { watts: f.streams.watts }],
      [/\/activity\//, f.activity],
      [/\/events\?/, []],
      [/\/events?\//, f.event],
    ];
  }

  it("rejects an over-long range before any HTTP", async () => {
    const fetchFn = routedFetch([]);
    await expect(
      build(fetchFn).compareIntensityDistributionRange({
        oldest: "2026-06-01",
        newest: "2026-08-01",
      })
    ).rejects.toThrow(new RegExp(`${MAX_RANGE_DAYS}-day`));
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("sums to the per-session figures and lists the detail rows", async () => {
    const result = await build(
      routedFetch(rangeRoutes())
    ).compareIntensityDistributionRange({
      oldest: "2026-07-29",
      newest: "2026-07-30",
    });

    expect(result.sessions).toHaveLength(1);
    expect(result.middleBand?.plannedSeconds).toBe(
      result.sessions[0].middleBandPlannedSeconds
    );
    expect(result.middleBand?.deliveredSeconds).toBe(
      result.sessions[0].middleBandDeliveredSeconds
    );
    expect(seconds(result, "L3")?.plannedSeconds).toBe(2160);
  });

  it("excludes an unpaired activity from every sum and reports it", async () => {
    const result = await build(
      routedFetch(rangeRoutes())
    ).compareIntensityDistributionRange({
      oldest: "2026-07-29",
      newest: "2026-07-30",
    });

    expect(result.excluded).toContainEqual(
      expect.objectContaining({ activityId: "i999", reason: "no-paired-event" })
    );
    // The sums are the one paired session's, untouched by the commute.
    expect(result.middleBand?.plannedSeconds).toBe(2160);
  });

  it("excludes a session with no recorded power rather than counting it as zero", async () => {
    const routes = rangeRoutes().map(
      ([p, b]) =>
        (/streams/.test(String(p)) ? [p, {}] : [p, b]) as [RegExp, unknown]
    );
    const result = await build(
      routedFetch(routes)
    ).compareIntensityDistributionRange({
      oldest: "2026-07-29",
      newest: "2026-07-30",
    });

    expect(result.sessions).toHaveLength(0);
    expect(result.excluded).toContainEqual(
      expect.objectContaining({ reason: "no-recorded-power" })
    );
    // Zero sessions is not zero seconds prescribed — the aggregate says nothing
    // rather than saying the athlete did nothing.
    expect(result.middleBand?.plannedSeconds).toBe(0);
  });
});

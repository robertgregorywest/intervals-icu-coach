import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { HttpClient } from "../../../src/client.js";
import { EventsApi } from "../../../src/services/events/events.js";
import { WellnessApi } from "../../../src/services/wellness/wellness.js";
import { AthleteApi } from "../../../src/services/athlete/athlete.js";
import { TrainingLoadForecast } from "../../../src/services/training-load-forecast/forecast.js";
import type { ForecastOptions } from "../../../src/services/training-load-forecast/index.js";
import { createAthleteAnchors } from "../../../src/services/athlete-anchors/index.js";
import type { IActivitiesApi } from "../../../src/services/activities/index.js";
import type { IPowerCurvesApi } from "../../../src/services/power-curves/index.js";

const FIXTURE = JSON.parse(
  readFileSync(
    fileURLToPath(
      new URL(
        "../../fixtures/training-load-forecast/wellness.json",
        import.meta.url
      )
    ),
    "utf8"
  )
) as {
  harvest: {
    ftp: number;
    timeConstants: { ctlDays: number | null; atlDays: number | null };
  };
  records: Array<{ date: string; ctl: number; atl: number; ctlLoad: number }>;
  events: Array<Record<string, unknown>>;
};

const config = {
  apiKey: "test-api-key",
  athleteId: "i12345",
  baseUrl: "https://intervals.icu",
};

const SPORT_SETTINGS = [
  {
    types: ["Ride", "VirtualRide", "TrackRide"],
    ftp: FIXTURE.harvest.ftp,
    power_zones: [55, 75, 90, 105, 120, 150, 999],
    ctl_days: FIXTURE.harvest.timeConstants.ctlDays,
    atl_days: FIXTURE.harvest.timeConstants.atlDays,
  },
];

/** The window the forecast covers in these tests: a full Monday-to-Sunday week. */
const OLDEST = "2026-08-10";
const NEWEST = "2026-08-16";

interface StubOptions {
  events?: unknown[];
  wellness?: unknown[];
  sportSettings?: unknown;
}

function build(stub: StubOptions = {}) {
  const wellness =
    stub.wellness ??
    FIXTURE.records.map((r) => ({
      id: r.date,
      ctl: r.ctl,
      atl: r.atl,
      ctlLoad: r.ctlLoad,
    }));
  const events = stub.events ?? [];

  const fetchFn = vi.fn(async (url: string) => {
    const body = /\/wellness\?/.test(url)
      ? (wellness as unknown[]).filter((w) => {
          const record = w as { id: string };
          const [, oldest] = /oldest=([\d-]+)/.exec(url)!;
          const [, newest] = /newest=([\d-]+)/.exec(url)!;
          return record.id >= oldest && record.id <= newest;
        })
      : /\/events\?/.test(url)
        ? events
        : {
            id: config.athleteId,
            sportSettings: stub.sportSettings ?? SPORT_SETTINGS,
          };
    return {
      ok: true,
      status: 200,
      statusText: "OK",
      headers: new Headers({ "content-type": "application/json" }),
      json: () => Promise.resolve(body),
      text: () => Promise.resolve(JSON.stringify(body)),
    } as unknown as Response;
  });

  const httpClient = new HttpClient(config, fetchFn as never);
  const service = new TrainingLoadForecast({
    eventsApi: new EventsApi(httpClient, config.athleteId),
    wellnessApi: new WellnessApi(httpClient, config.athleteId),
    anchors: createAthleteAnchors({
      athleteApi: new AthleteApi(httpClient, config.athleteId),
      activitiesApi: {} as IActivitiesApi,
      powerCurvesApi: {} as IPowerCurvesApi,
    }),
  });
  return { service, fetchFn };
}

function run(options: Partial<ForecastOptions> = {}, stub: StubOptions = {}) {
  const { service, fetchFn } = build(stub);
  return service
    .forecastTrainingLoad({ oldest: OLDEST, newest: NEWEST, ...options })
    .then((result) => ({ result, fetchFn }));
}

const ride = (
  date: string,
  extra: Record<string, unknown> = {}
): Record<string, unknown> => ({
  id: 1,
  category: "WORKOUT",
  type: "Ride",
  name: "Session",
  start_date_local: `${date}T00:00:00`,
  description: "- 60m 200w",
  ...extra,
});

describe("forecast — deriving a session's load", () => {
  it("costs a proposed session from its own workout text", async () => {
    const { result } = await run({
      sessions: [
        { date: "2026-08-12", description: "- 60m 200w", name: "Steady hour" },
      ],
    });
    const session = result.sessions.find((s) => s.date === "2026-08-12")!;
    expect(session.source).toBe("local-parse");
    expect(session.normalizedPower).toBeCloseTo(200, 6);
    // IF 200/286 = 0.6993; 0.6993² × 1h × 100 = 48.9, stored as the whole
    // point the platform would store.
    expect(session.load).toBe(49);
    expect(session.durationSeconds).toBe(3600);
  });

  it("resolves a zone target against the athlete's FTP power zones", async () => {
    const { result } = await run({
      sessions: [{ date: "2026-08-12", description: "- 60m Z2" }],
    });
    // The platform returned 186 W for Z2 at FTP 286, captured in the zone fixture.
    expect(
      result.sessions.find((s) => s.date === "2026-08-12")!.normalizedPower
    ).toBeCloseTo(186, 6);
  });

  it("reports a session it cannot resolve as underivable, not as zero", async () => {
    const { result } = await run(
      { sessions: [{ date: "2026-08-12", description: "- 60m Z2 HR" }] },
      { sportSettings: [{ types: ["Ride"], ftp: 286, power_zones: null }] }
    );
    const session = result.sessions.find((s) => s.date === "2026-08-12")!;
    expect(session.source).toBe("underivable");
    expect(session.load).toBe(0);
    expect(session.note).toMatch(/resolved to watts/i);
  });

  it("takes a caller-supplied load for a session with no shape yet", async () => {
    const { result } = await run({
      sessions: [
        {
          date: "2026-08-15",
          name: "Club run",
          load: 180,
          durationSeconds: 10_800,
        },
      ],
    });
    const session = result.sessions.find((s) => s.date === "2026-08-15")!;
    expect(session).toMatchObject({ source: "caller-supplied", load: 180 });
  });
});

describe("forecast — merging with the calendar", () => {
  it("keeps planned work on a date nothing is proposed for", async () => {
    const { result } = await run(
      {},
      { events: [ride("2026-08-11", { icu_training_load: 90 })] }
    );
    expect(result.sessions).toHaveLength(1);
    expect(result.sessions[0]).toMatchObject({
      origin: "planned",
      source: "platform",
      load: 90,
    });
  });

  it("replaces the planned work on a date a session is proposed for", async () => {
    const { result } = await run(
      {
        sessions: [
          { date: "2026-08-11", description: "- 30m 150w", name: "Easier" },
        ],
      },
      { events: [ride("2026-08-11", { icu_training_load: 90 })] }
    );
    expect(result.sessions).toHaveLength(1);
    expect(result.sessions[0]).toMatchObject({
      origin: "proposed",
      name: "Easier",
    });
    expect(result.sessions[0].load).toBeLessThan(90);
  });

  it("prefers the platform's own load on a written session over re-deriving it", async () => {
    // The description would derive ~48.9. The platform says 90. The platform wins:
    // its figure is what the athlete's dashboard shows.
    const { result } = await run(
      {},
      { events: [ride("2026-08-11", { icu_training_load: 90 })] }
    );
    expect(result.sessions[0].load).toBe(90);
    expect(result.sessions[0].normalizedPower).toBeUndefined();
  });

  it("derives a planned session the platform gave no load", async () => {
    const { result } = await run(
      {},
      { events: [ride("2026-08-11", { icu_training_load: undefined })] }
    );
    expect(result.sessions[0].source).toBe("local-parse");
    expect(result.sessions[0].load).toBe(49);
  });

  it("ignores calendar notes, which are not sessions", async () => {
    const { result } = await run(
      {},
      {
        events: [
          {
            id: 9,
            category: "NOTE",
            type: null,
            name: "Travel",
            start_date_local: "2026-08-11T00:00:00",
            description: "",
          },
        ],
      }
    );
    expect(result.sessions).toHaveLength(0);
  });

  it("ignores work outside the window", async () => {
    const { result } = await run({
      sessions: [{ date: "2026-09-01", load: 200 }],
    });
    expect(result.sessions).toHaveLength(0);
  });
});

describe("forecast — what the platform does not model", () => {
  it("gives a strength session no load and says so", async () => {
    const { result } = await run(
      {},
      {
        events: [
          ride("2026-08-11", {
            type: "WeightTraining",
            icu_training_load: undefined,
            description: "",
          }),
        ],
      }
    );
    expect(result.sessions[0]).toMatchObject({
      source: "unmodelled-strength",
      load: 0,
    });
    expect(result.notes.join(" ")).toMatch(/strength/i);
  });

  it("excludes a proposed strength session too", async () => {
    const { result } = await run({
      sessions: [{ date: "2026-08-11", type: "WeightTraining", load: 60 }],
    });
    expect(result.sessions[0]).toMatchObject({
      source: "unmodelled-strength",
      load: 0,
    });
  });
});

describe("forecast — the trajectory and its roll-up", () => {
  it("carries a day for every date in the window", async () => {
    const { result } = await run();
    expect(result.days.map((d) => d.date)).toEqual([
      "2026-08-10",
      "2026-08-11",
      "2026-08-12",
      "2026-08-13",
      "2026-08-14",
      "2026-08-15",
      "2026-08-16",
    ]);
    for (const day of result.days) {
      expect(day.tsb).toBeCloseTo(day.ctl - day.atl, 9);
    }
  });

  it("seeds from the delivered record for the day before the window", async () => {
    const { result } = await run();
    const seed = FIXTURE.records.find((r) => r.date === "2026-08-09")!;
    expect(result.basis.seedDate).toBe("2026-08-09");
    expect(result.basis.seedSource).toBe("delivered-wellness");
    expect(result.basis.seedCtl).toBeCloseTo(seed.ctl, 6);
    expect(result.basis.seedAtl).toBeCloseTo(seed.atl, 6);
  });

  it("uses a caller-supplied seed and records that it was supplied", async () => {
    const { result } = await run({ seed: { ctl: 40, atl: 30 } });
    expect(result.basis).toMatchObject({
      seedSource: "caller-supplied",
      seedCtl: 40,
      seedAtl: 30,
    });
    // A rest week from CTL 40 decays toward zero, not toward the delivered 54.
    expect(result.days[0].ctl).toBeLessThan(40);
  });

  it("defines ramp on the first day of the window from delivered history", async () => {
    const { result } = await run();
    expect(result.days[0].ramp).toBeDefined();
    expect(result.basis.historyDays).toBeGreaterThanOrEqual(7);
  });

  it("rolls the week up to its load, its duration and its fitness change", async () => {
    const { result } = await run({
      sessions: [
        { date: "2026-08-11", load: 100, durationSeconds: 3600 },
        { date: "2026-08-13", load: 60, durationSeconds: 1800 },
      ],
    });
    expect(result.weeks).toHaveLength(1);
    expect(result.weeks[0]).toMatchObject({
      weekStart: "2026-08-10",
      weekEnd: "2026-08-16",
      load: 160,
      durationSeconds: 5400,
      complete: true,
    });
    expect(result.weeks[0].ramp).toBeCloseTo(
      result.weeks[0].ctlEnd - result.weeks[0].ctlStart,
      9
    );
  });

  it("flags a week the window only partly covers", async () => {
    const { result } = await run({
      oldest: "2026-08-12",
      newest: "2026-08-16",
    });
    expect(result.weeks[0].complete).toBe(false);
  });

  it("splits a multi-week window at the Monday", async () => {
    const { result } = await run({
      oldest: "2026-08-10",
      newest: "2026-08-20",
    });
    expect(result.weeks.map((w) => w.weekStart)).toEqual([
      "2026-08-10",
      "2026-08-17",
    ]);
  });
});

describe("forecast — the basis it states", () => {
  it("names the threshold, the time constants and their origin", async () => {
    const { result } = await run();
    expect(result.basis).toMatchObject({
      ftp: FIXTURE.harvest.ftp,
      ftpSource: "athlete-sport-settings",
      ctlDays: 42,
      atlDays: 7,
      timeConstantsSource: "platform-defaults",
    });
  });

  it("reads the athlete's own time constants when they are set", async () => {
    const { result } = await run(
      {},
      {
        sportSettings: [
          {
            types: ["Ride"],
            ftp: 286,
            power_zones: null,
            ctl_days: 30,
            atl_days: 5,
          },
        ],
      }
    );
    expect(result.basis).toMatchObject({
      ctlDays: 30,
      atlDays: 5,
      timeConstantsSource: "athlete-sport-settings",
    });
  });

  it("names a caller-supplied threshold as such", async () => {
    const { result } = await run({ ftp: 300 });
    expect(result.basis).toMatchObject({
      ftp: 300,
      ftpSource: "caller-supplied",
    });
  });
});

describe("forecast — refusals and read-only behaviour", () => {
  it("writes nothing to Intervals.icu", async () => {
    const { fetchFn } = await run({
      sessions: [{ date: "2026-08-12", description: "- 60m 200w" }],
    });
    for (const call of fetchFn.mock.calls) {
      const init = call[1] as { method?: string } | undefined;
      expect(init?.method ?? "GET").toBe("GET");
    }
  });

  it("refuses a backwards window rather than returning an empty one", async () => {
    const { service } = build();
    await expect(
      service.forecastTrainingLoad({
        oldest: "2026-08-16",
        newest: "2026-08-10",
      })
    ).rejects.toThrow(/must be on or after/);
  });

  it("refuses rather than guessing when there is no seed to start from", async () => {
    const { service } = build({ wellness: [] });
    await expect(
      service.forecastTrainingLoad({ oldest: OLDEST, newest: NEWEST })
    ).rejects.toThrow(/wellness record/i);
  });

  it("refuses rather than guessing when no threshold is available", async () => {
    const { service } = build({
      sportSettings: [{ types: ["Ride"], ftp: null }],
    });
    await expect(
      service.forecastTrainingLoad({ oldest: OLDEST, newest: NEWEST })
    ).rejects.toThrow(/No FTP/i);
  });
});

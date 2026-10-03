import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  DEFAULT_ATL_DAYS,
  DEFAULT_CTL_DAYS,
  advance,
  eachDate,
  form,
  project,
  shiftDate,
} from "../../../src/services/training-load/forecast/trajectory.js";

const WELLNESS = JSON.parse(
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
    timeConstants: { ctlDays: number | null; atlDays: number | null };
  };
  records: Array<{
    date: string;
    ctl: number;
    atl: number;
    ctlLoad: number;
    atlLoad: number;
    rampRate: number;
  }>;
};

const CONSTANTS = {
  ctlDays: WELLNESS.harvest.timeConstants.ctlDays ?? DEFAULT_CTL_DAYS,
  atlDays: WELLNESS.harvest.timeConstants.atlDays ?? DEFAULT_ATL_DAYS,
};

/**
 * The API serialises these as float32, so the committed figures carry about
 * seven significant digits. Anything looser would stop being a regression test
 * on the recursion and start being a test of nothing.
 */
const FLOAT32_TOLERANCE = 1e-4;

describe("trajectory — regression against the delivered series", () => {
  it("has a long enough series to exercise the fitness constant", () => {
    expect(WELLNESS.records.length).toBeGreaterThan(60);
  });

  it("reproduces the whole delivered series from its first record and the loads alone", () => {
    const [seed, ...rest] = WELLNESS.records;
    const projected = project(
      { ctl: seed.ctl, atl: seed.atl },
      rest.map((r) => ({ date: r.date, load: r.ctlLoad })),
      CONSTANTS,
      [{ date: seed.date, ctl: seed.ctl }]
    );

    expect(projected).toHaveLength(rest.length);
    for (const [i, day] of projected.entries()) {
      expect(day.date).toBe(rest[i].date);
      expect(day.ctl).toBeCloseTo(rest[i].ctl, 4);
      expect(day.atl).toBeCloseTo(rest[i].atl, 4);
    }
  });

  it("does not drift over eleven weeks of compounding", () => {
    // The recursion is applied ~110 times here. A model that is subtly wrong
    // still tracks for a fortnight, so the last day is the assertion that
    // matters, not the first.
    const [seed, ...rest] = WELLNESS.records;
    const projected = project(
      { ctl: seed.ctl, atl: seed.atl },
      rest.map((r) => ({ date: r.date, load: r.ctlLoad })),
      CONSTANTS
    );
    const last = projected.at(-1)!;
    const actual = rest.at(-1)!;
    expect(Math.abs(last.ctl - actual.ctl)).toBeLessThan(FLOAT32_TOLERANCE);
    expect(Math.abs(last.atl - actual.atl)).toBeLessThan(FLOAT32_TOLERANCE);
  });

  it("reproduces the platform's own ramp figure", () => {
    const [seed, ...rest] = WELLNESS.records;
    const projected = project(
      { ctl: seed.ctl, atl: seed.atl },
      rest.map((r) => ({ date: r.date, load: r.ctlLoad })),
      CONSTANTS,
      [{ date: seed.date, ctl: seed.ctl }]
    );
    const withRamp = projected.filter((d) => d.ramp !== undefined);
    expect(withRamp.length).toBeGreaterThan(50);
    for (const day of withRamp) {
      const actual = rest.find((r) => r.date === day.date)!;
      expect(day.ramp!).toBeCloseTo(actual.rampRate, 3);
    }
  });

  it("defines ramp on the first forecast day when history reaches behind it", () => {
    const history = WELLNESS.records.slice(0, 8);
    const seed = history.at(-1)!;
    const [next] = WELLNESS.records.slice(8);
    const [day] = project(
      { ctl: seed.ctl, atl: seed.atl },
      [{ date: next.date, load: next.ctlLoad }],
      CONSTANTS,
      history.map((h) => ({ date: h.date, ctl: h.ctl }))
    );
    expect(day.ramp).toBeCloseTo(next.rampRate, 3);
  });

  it("leaves ramp absent rather than reporting it against a day it never saw", () => {
    const [day] = project(
      { ctl: 50, atl: 50 },
      [{ date: "2026-09-01", load: 80 }],
      CONSTANTS
    );
    expect(day.ramp).toBeUndefined();
  });
});

describe("trajectory — the model itself", () => {
  it("moves fatigue faster than fitness for the same load", () => {
    const from = { ctl: 50, atl: 50 };
    const to = advance(from, 150, CONSTANTS);
    expect(to.atl - 50).toBeGreaterThan(to.ctl - 50);
  });

  it("decays both toward zero on a rest day", () => {
    const to = advance({ ctl: 50, atl: 60 }, 0, CONSTANTS);
    expect(to.ctl).toBeLessThan(50);
    expect(to.atl).toBeLessThan(60);
  });

  it("reads form as same-day fitness minus fatigue", () => {
    expect(form({ ctl: 55.878094, atl: 61.56981 })).toBeCloseTo(-5.691716, 6);
  });

  it("counts calendar days in UTC, so a DST shift cannot drop one", () => {
    expect(shiftDate("2026-03-28", 1)).toBe("2026-03-29");
    expect(shiftDate("2026-10-25", 1)).toBe("2026-10-26");
    expect(eachDate("2026-03-28", "2026-03-31")).toEqual([
      "2026-03-28",
      "2026-03-29",
      "2026-03-30",
      "2026-03-31",
    ]);
  });
});

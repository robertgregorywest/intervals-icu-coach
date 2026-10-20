import { describe, it, expect } from "vitest";
import { isCalendarDate } from "../../src/shared/dates.js";

describe("isCalendarDate", () => {
  it("accepts a real day, a leap day in a leap year included", () => {
    expect(isCalendarDate("2026-09-01")).toBe(true);
    expect(isCalendarDate("2024-02-29")).toBe(true);
  });

  it("refuses a day the month doesn't have, rather than rolling it over", () => {
    for (const date of ["2026-02-29", "2026-02-30", "2026-04-31"]) {
      expect(isCalendarDate(date), date).toBe(false);
    }
  });

  it("refuses what doesn't parse, or parses from another format", () => {
    for (const date of ["2026-13-01", "soon", "", "+002026-09-01"]) {
      expect(isCalendarDate(date), date).toBe(false);
    }
  });
});

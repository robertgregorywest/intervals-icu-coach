import { describe, it, expect } from "vitest";
import { dateRange } from "../../src/shared/date-range.js";

describe("dateRange — the one guard", () => {
  it("counts both ends", () => {
    expect(dateRange("2026-09-01", "2026-09-01").days).toBe(1);
    expect(dateRange("2026-09-01", "2026-09-28").days).toBe(28);
  });

  it("counts calendar days across a DST change", () => {
    expect(dateRange("2026-03-28", "2026-03-30").days).toBe(3);
  });

  it("accepts a range exactly at the cap", () => {
    expect(dateRange("2026-09-01", "2026-09-28", { maxDays: 28 })).toEqual({
      oldest: "2026-09-01",
      newest: "2026-09-28",
      days: 28,
    });
  });

  it("refuses a range one day past the cap, with the caller's reason", () => {
    expect(() =>
      dateRange("2026-09-01", "2026-09-29", {
        maxDays: 28,
        why: "Narrow it to one block.",
      })
    ).toThrow(
      /spans 29 days, over the 28-day maximum\. Narrow it to one block\./
    );
  });

  it("is uncapped when no cap is given", () => {
    expect(dateRange("2000-01-01", "2026-01-01").days).toBeGreaterThan(9000);
  });

  it("refuses a range that ends before it starts", () => {
    expect(() => dateRange("2026-09-02", "2026-09-01")).toThrow(
      /ends before it starts/
    );
  });

  it("refuses a date that is not YYYY-MM-DD", () => {
    expect(() => dateRange("2026-9-1", "2026-09-10")).toThrow(/YYYY-MM-DD/);
    expect(() => dateRange("2026-09-01", "soon")).toThrow(/YYYY-MM-DD/);
  });
});

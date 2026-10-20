import { describe, it, expect } from "vitest";
import { dateString } from "../../src/tools/common.js";

const messages = (value: string) =>
  dateString.safeParse(value).error?.issues.map((i) => i.message) ?? [];

describe("dateString", () => {
  it("accepts a real YYYY-MM-DD day", () => {
    expect(dateString.parse("2024-02-29")).toBe("2024-02-29");
  });

  it("refuses a day the month doesn't have, rather than rolling it over", () => {
    expect(messages("2026-02-30")).toEqual(["must be a real calendar date"]);
  });

  it("refuses a month that doesn't exist without throwing", () => {
    expect(messages("2026-13-01")).toEqual(["must be a real calendar date"]);
  });

  it("refuses another format", () => {
    expect(messages("2026-9-1")).toEqual(["must be YYYY-MM-DD"]);
  });
});

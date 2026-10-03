import { describe, it, expect } from "vitest";
import { planFtp } from "../../src/shared/plan-ftp.js";

describe("planFtp — the one event → ride → athlete order", () => {
  it("takes the event's own FTP first", () => {
    expect(planFtp({ icu_ftp: 300 }, { icu_ftp: 320 }, 286)).toBe(300);
  });

  it("takes the ride's FTP when the event carries none", () => {
    expect(planFtp({ icu_ftp: null }, { icu_ftp: 320 }, 286)).toBe(320);
  });

  it("falls back to the athlete's only when neither half carries one", () => {
    expect(planFtp({}, undefined, 286)).toBe(286);
    expect(planFtp({ icu_ftp: 0 }, { icu_ftp: 0 }, 286)).toBe(286);
  });

  it("skips the event term for a ride with no paired event", () => {
    expect(planFtp(null, { icu_ftp: 320 }, 286)).toBe(320);
    expect(planFtp(null, null, 286)).toBe(286);
  });

  it("answers null rather than guessing", () => {
    expect(planFtp({}, null, null)).toBeNull();
  });
});

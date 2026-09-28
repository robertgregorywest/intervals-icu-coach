import { describe, it, expect } from "vitest";
import { WORK_WORDS } from "../src/work-words.js";

describe("WORK_WORDS", () => {
  it("is normalised the way a label's first word is, so every entry can match", () => {
    for (const word of WORK_WORDS) {
      expect(word, word).toMatch(/^[a-z0-9]+$/);
    }
  });

  it("holds the words the athlete's sessions declare work with", () => {
    for (const word of ["threshold", "sst", "vo2", "sprint", "over", "under"]) {
      expect(WORK_WORDS.has(word), word).toBe(true);
    }
  });

  it("leaves endurance and steady out — the band lens reads those", () => {
    expect(WORK_WORDS.has("endurance")).toBe(false);
    expect(WORK_WORDS.has("steady")).toBe(false);
  });
});

import { describe, it, expect } from "vitest";
import { createPrescription } from "../../../src/services/prescription/index.js";
import {
  stripMarkers,
  extractProse,
  extractPurpose,
  hasTemplateMarker,
  parseDescriptionSummary,
} from "../../../src/services/workout-library/parser.js";

describe("stripMarkers", () => {
  it("removes the template marker", () => {
    const desc = "- 4m 360w\n\n<!-- template: vo2-4x4 -->";
    expect(stripMarkers(desc)).toBe("- 4m 360w");
  });

  it("removes a legacy rationale block", () => {
    const desc =
      '- 4m 360w\n\n<!-- rationale {"basis":"MAP","anchorWatts":380} -->';
    expect(stripMarkers(desc)).toBe("- 4m 360w");
  });

  it("leaves an unmarked description alone", () => {
    expect(stripMarkers("- 5m 95%")).toBe("- 5m 95%");
  });
});

describe("hasTemplateMarker", () => {
  it("is true only for the current marker", () => {
    expect(hasTemplateMarker("x\n<!-- template: openers -->")).toBe(true);
    expect(hasTemplateMarker('x\n<!-- rationale {"basis":"MAP"} -->')).toBe(
      false
    );
    expect(hasTemplateMarker("- 5m 95%")).toBe(false);
  });
});

describe("extractProse / extractPurpose", () => {
  const desc = [
    "Day before a race. Opens the legs without cost.",
    "",
    "Longer rationale paragraph explaining the session.",
    "",
    "- Warm up 20m 160w",
    "",
    "<!-- template: openers -->",
  ].join("\n");

  it("returns the text preceding the first step", () => {
    expect(extractProse(desc)).toBe(
      "Day before a race. Opens the legs without cost.\n\nLonger rationale paragraph explaining the session."
    );
  });

  it("purpose is the first paragraph only", () => {
    expect(extractPurpose(desc)).toBe(
      "Day before a race. Opens the legs without cost."
    );
  });

  it("purpose is undefined when there is no prose", () => {
    expect(extractPurpose("- 5m 95%")).toBeUndefined();
  });
});

describe("parseDescriptionSummary", () => {
  const prescription = createPrescription();

  it("counts simple steps and sums durations", () => {
    const desc = "- 10m 75%\n- 5m 50%";
    const s = parseDescriptionSummary(desc, prescription);
    expect(s.stepCount).toBe(2);
    expect(s.totalSeconds).toBe(15 * 60);
    expect(s.oneLine).toBe("2 steps, 15m");
    expect(s.hasTemplate).toBe(false);
  });

  it("expands repeat blocks", () => {
    const desc = "4x\n- 4m 110%\n- 4m 50%";
    const s = parseDescriptionSummary(desc, prescription);
    expect(s.stepCount).toBe(8);
    expect(s.totalSeconds).toBe(4 * (4 * 60 + 4 * 60));
  });

  it("handles labels and complex durations", () => {
    const desc = "- Warmup 10m 60%\n- Main 1h2m30s 75%";
    const s = parseDescriptionSummary(desc, prescription);
    expect(s.stepCount).toBe(2);
    expect(s.totalSeconds).toBe(10 * 60 + (1 * 3600 + 2 * 60 + 30));
  });

  it("flags distance-based steps", () => {
    const desc = "- 2km 90%";
    const s = parseDescriptionSummary(desc, prescription);
    expect(s.stepCount).toBe(1);
    expect(s.totalSeconds).toBe(0);
    expect(s.oneLine).toContain("includes distance steps");
  });

  // Intervals.icu accepts a dash with no following space, and workouts authored
  // in its UI commonly use it. Previously these parsed as "Empty workout".
  it("accepts a step line with no space after the dash", () => {
    const desc = "-Warm-up 5m 160w\n-Pre-load 2m 350w";
    const s = parseDescriptionSummary(desc, prescription);
    expect(s.stepCount).toBe(2);
    expect(s.totalSeconds).toBe(7 * 60);
  });

  it("counts a repeat block written without the space", () => {
    const desc = "-Warm-up 5m 160w\n\n10x\n-Hard 30s 375w\n-Recovery 30s 190w";
    const s = parseDescriptionSummary(desc, prescription);
    expect(s.stepCount).toBe(21);
    expect(s.totalSeconds).toBe(5 * 60 + 10 * 60);
  });

  it("ignores the marker when summarizing", () => {
    const desc = "- 4m 360w\n\n<!-- template: vo2-4x4 -->";
    const s = parseDescriptionSummary(desc, prescription);
    expect(s.stepCount).toBe(1);
    expect(s.hasTemplate).toBe(true);
  });

  it("returns empty summary for blank descriptions", () => {
    expect(parseDescriptionSummary("", prescription).oneLine).toBe(
      "Empty workout"
    );
  });

  // Counting goes through the Prescription module's parse, so a line the
  // platform drops is not listed as a step.
  it("does not count a step line the platform would drop", () => {
    const desc = "- MAX standing start from near-stop\n- 10m 200w";
    const s = parseDescriptionSummary(desc, prescription);
    expect(s.stepCount).toBe(1);
    expect(s.totalSeconds).toBe(600);
  });

  it("counts a distance step inside a repeat once per rep", () => {
    const desc = "3x\n- 1km Z4\n- 2m Z1";
    const s = parseDescriptionSummary(desc, prescription);
    expect(s.stepCount).toBe(6);
    expect(s.totalSeconds).toBe(3 * 120);
    expect(s.oneLine).toContain("includes distance steps");
  });

  // matchRepeatHeader has no left-boundary requirement before the digit,
  // matching the platform's own reading of a repeat header — unlike the
  // former REPEAT_RE, which required whitespace or line-start before it.
  it("recognises a repeat header glued to preceding text", () => {
    const desc = "Round3x\n- 4m 110%\n- 4m 50%";
    const s = parseDescriptionSummary(desc, prescription);
    expect(s.stepCount).toBe(6);
    expect(s.totalSeconds).toBe(3 * (4 * 60 + 4 * 60));
  });
});

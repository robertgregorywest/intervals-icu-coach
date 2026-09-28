import { describe, it, expect } from "vitest";
import { createWorkoutParser } from "../../../src/services/workout-parser/index.js";
import { EVENTS, ZONE_TARGETS, flattenDocSteps } from "./fixture.js";
import type { PlannedDocStep } from "../../../src/types.js";

const parser = createWorkoutParser();

/**
 * The three things the fidelity contract is about, and nothing else. A step's
 * power target is compared as the platform *stores* it — a percentage stays a
 * percentage, a zone stays a zone number — so this comparison never resolves
 * anything to watts and cannot go stale when the athlete's threshold moves.
 */
function contract(step: PlannedDocStep) {
  return {
    duration: step.duration,
    ramp: step.ramp === true,
    power: step.power ?? null,
  };
}

describe("workout-text parser — fidelity against the platform's own parse", () => {
  it("has a corpus to assert against", () => {
    expect(EVENTS.entries.length).toBeGreaterThan(100);
  });

  it.each(EVENTS.entries.map((e) => [`${e.date} ${e.name}`, e] as const))(
    "reproduces the platform's steps for %s",
    (_label, entry) => {
      const parsed = parser.parse(entry.description);
      const got = flattenDocSteps(parsed.doc.steps).map(contract);
      const expected = flattenDocSteps(entry.workout_doc.steps).map(contract);

      expect(got).toEqual(expected);
      expect(parsed.doc.duration).toBe(entry.workout_doc.duration);
    }
  );

  it("reproduces the platform's repeat-block structure, not just the flat list", () => {
    // A repeat block is a step in its own right on the platform, carrying its
    // reps, its header text and the total time it accounts for. Flattening
    // alone would let a 3x block and three copied steps look identical.
    const withRepeats = EVENTS.entries.filter((e) =>
      (e.workout_doc.steps ?? []).some((s) => typeof s.reps === "number")
    );
    expect(withRepeats.length).toBeGreaterThan(10);

    for (const entry of withRepeats) {
      const got = (parser.parse(entry.description).doc.steps ?? [])
        .filter((s) => typeof s.reps === "number")
        .map((s) => ({ reps: s.reps, text: s.text, duration: s.duration }));
      const expected = (entry.workout_doc.steps ?? [])
        .filter((s) => typeof s.reps === "number")
        .map((s) => ({ reps: s.reps, text: s.text, duration: s.duration }));
      expect(got, entry.name).toEqual(expected);
    }
  });
});

describe("workout-text parser — reconstruction rules", () => {
  it("expands a repeat block once per repetition", () => {
    const parsed = parser.parse("3x\n- Hard 1m 300w\n- Easy 2m 150w");
    const block = parsed.doc.steps?.[0];
    expect(block?.reps).toBe(3);
    expect(block?.steps).toHaveLength(2);
    expect(block?.duration).toBe(540);
    expect(flattenDocSteps(parsed.doc.steps)).toHaveLength(6);
  });

  it("closes a repeat block at the blank line", () => {
    const parsed = parser.parse("3x\n- Hard 1m 300w\n\n- Cool down 10m 150w");
    expect(parsed.doc.steps?.map((s) => s.reps)).toEqual([3, undefined]);
    expect(parsed.doc.steps?.[1].duration).toBe(600);
  });

  it("discards a step line carrying no duration, and names it", () => {
    const parsed = parser.parse(
      "- MAX standing start from near-stop\n- 10m 200w"
    );
    expect(parsed.doc.steps).toHaveLength(1);
    expect(parsed.discarded).toEqual([
      {
        line: 1,
        text: "- MAX standing start from near-stop",
        reason: "no parseable duration",
      },
    ]);
  });

  it("discards a zero-duration step rather than emitting it", () => {
    // Measured: the platform drops `- Cool Down 0s` outright.
    const parsed = parser.parse("- 10m 200w\n- Cool Down 0s");
    expect(parsed.doc.steps).toHaveLength(1);
    expect(parsed.discarded[0].reason).toBe("zero duration");
  });

  it("does not turn prose into a step", () => {
    const parsed = parser.parse(
      "Intent: bridge the VO2 gap. MAP = 394w.\n\n- 10m 200w"
    );
    expect(parsed.doc.steps).toHaveLength(1);
    expect(parsed.notes).toEqual(["Intent: bridge the VO2 gap. MAP = 394w."]);
  });

  // Measured against the platform for #37: a line of three or more dashes is
  // dropped silently and closes an open block, as a blank line does.
  it("drops a horizontal rule without naming it as a discarded step", () => {
    for (const rule of ["---", "-----", "- - -"]) {
      const parsed = parser.parse(`Purpose line.\n${rule}\n- 10m 200w`);
      expect(parsed.doc.steps).toHaveLength(1);
      expect(parsed.discarded).toEqual([]);
      expect(parsed.notes).toEqual(["Purpose line."]);
    }
  });

  it("closes a repeat block at a horizontal rule", () => {
    const parsed = parser.parse("3x\n- 1m 300w\n---\n- 1m 100w");
    expect(parsed.doc.steps?.map((s) => s.reps)).toEqual([3, undefined]);
    expect(parsed.doc.duration).toBe(240);
  });

  it("closes a section at a horizontal rule", () => {
    const parsed = parser.parse("Warmup\n- 1m 150w\n---\n- 1m 100w");
    expect(parsed.doc.steps?.map((s) => s.warmup)).toEqual([true, undefined]);
  });

  it("reads a two-dash line, or a rule with text, as a dropped step inside the block", () => {
    for (const line of ["--", "--- note"]) {
      const parsed = parser.parse(`3x\n- 1m 300w\n${line}\n- 1m 100w`);
      expect(parsed.doc.duration).toBe(360);
      expect(parsed.discarded).toEqual([
        { line: 3, text: line, reason: "no parseable duration", reps: 3 },
      ]);
    }
  });

  it("flags the steps under a Warmup or Cooldown header", () => {
    const parsed = parser.parse(
      "Warmup\n- 10m ramp 54-80%\n\n- 5m 74%\n\nCooldown\n- 10m ramp 60-47%"
    );
    expect(parsed.doc.steps?.map((s) => [s.warmup, s.cooldown])).toEqual([
      [true, undefined],
      [undefined, undefined],
      [undefined, true],
    ]);
  });

  it("keeps a ramp's direction, which a min/max band would lose", () => {
    const parsed = parser.parse("- 10m ramp 60-47%");
    expect(parsed.doc.steps?.[0]).toMatchObject({
      ramp: true,
      power: { units: "%ftp", start: 60, end: 47 },
    });
  });

  it("carries the anchors it was given as the document's basis", () => {
    const parsed = parser.parse("- 10m Z2", {
      ftp: 286,
      powerZones: [55, 75, 90, 105, 120, 150, 999],
    });
    expect(parsed.basis).toEqual({
      source: "local-parse",
      ftp: 286,
      powerZones: [55, 75, 90, 105, 120, 150, 999],
    });
  });

  it("stores a percentage as a percentage, leaving resolution to the caller", () => {
    // Parsing must not need an anchor. This is what lets the fidelity
    // assertion above run without a threshold.
    const parsed = parser.parse("- 20m 54-66%");
    expect(parsed.doc.steps?.[0].power).toEqual({
      units: "%ftp",
      start: 54,
      end: 66,
    });
    expect(parsed.basis.ftp).toBeNull();
  });
});

describe("workout-text parser — target resolution to watts", () => {
  // The one thing the harvested corpus cannot assert: the platform resolved
  // every percentage-anchored prescription at whatever threshold was on file
  // the day it was authored, which no event records. So resolution is asserted
  // against the thresholds this test chooses, and against the zone figures the
  // platform itself returned for a written probe.
  const FTP = ZONE_TARGETS.harvest.ftp;
  const ZONES = ZONE_TARGETS.harvest.powerZones;
  const anchors = { ftp: FTP, powerZones: ZONES };

  it("carries an absolute watt target through unchanged", () => {
    expect(
      parser.resolvePower({ units: "w", value: 300 }, { ftp: 100 })
    ).toEqual({
      target: { watts: 300 },
    });
    expect(
      parser.resolvePower({ units: "w", value: 300 }, { ftp: 400 })
    ).toEqual({
      target: { watts: 300 },
    });
  });

  it("resolves a percentage against the supplied threshold", () => {
    expect(
      parser.resolvePower({ units: "%ftp", value: 75 }, { ftp: 280 })
    ).toEqual({
      target: { watts: 210 },
    });
    expect(
      parser.resolvePower({ units: "%ftp", start: 54, end: 66 }, { ftp: 300 })
    ).toEqual({ target: { low: 162, high: 198 } });
  });

  it.each(
    ZONES.map((_, i) => [i + 1, ZONE_TARGETS.targets[`Z${i + 1}`]] as const)
  )(
    "resolves Z%i to the band whose midpoint the platform returned (%i W)",
    (zone, platformWatts) => {
      const { target } = parser.resolvePower(
        { units: "power_zone", value: zone },
        anchors
      );
      expect(target).toBeDefined();
      const midpoint = Math.round((target!.low! + target!.high!) / 2);
      expect(midpoint).toBe(platformWatts);
    }
  );

  it("resolves a zone by the zone path, not the equivalent percentage band", () => {
    // The platform returned 387 W for `Z6` and 386 W for `120-150%` at the same
    // FTP. Rounding the percentage band would silently be one watt out.
    expect(ZONE_TARGETS.targets["Z6"]).not.toBe(
      ZONE_TARGETS.targets["120-150%"]
    );
    const { target } = parser.resolvePower(
      { units: "power_zone", value: 6 },
      anchors
    );
    expect(Math.round((target!.low! + target!.high!) / 2)).toBe(
      ZONE_TARGETS.targets["Z6"]
    );
  });

  it("names an unresolvable percentage rather than guessing a denominator", () => {
    const out = parser.resolvePower({ units: "%ftp", value: 75 }, {});
    expect(out.target).toBeUndefined();
    expect(out.unresolved).toMatch(/no FTP/i);
  });

  it("names an unresolvable zone rather than defaulting it", () => {
    expect(
      parser.resolvePower({ units: "power_zone", value: 2 }, { ftp: 286 })
        .unresolved
    ).toMatch(/power zones/i);
    expect(
      parser.resolvePower(
        { units: "power_zone", value: 2 },
        { powerZones: ZONES }
      ).unresolved
    ).toMatch(/no FTP/i);
    expect(
      parser.resolvePower({ units: "power_zone", value: 9 }, anchors).unresolved
    ).toMatch(/outside/i);
  });

  it("names an unsupported unit rather than treating it as watts", () => {
    // `%hr` is a percentage too. Resolving it against FTP would produce a
    // confident wrong wattage where a stated gap is the honest answer.
    expect(
      parser.resolvePower({ units: "%hr", value: 75 }, anchors).unresolved
    ).toMatch(/unsupported/i);
    expect(
      parser.resolvePower({ units: "bpm", value: 150 }, anchors).unresolved
    ).toMatch(/unsupported/i);
  });
});

describe("workout-text parser — preamble", () => {
  it("is the text above the first step, paragraphs kept", () => {
    const parsed = parser.parse("First para.\n\nSecond para.\n\n- 10m 200w");
    expect(parsed.preamble).toBe("First para.\n\nSecond para.");
  });

  it("ends at a repeat header", () => {
    expect(parser.parse("Intent.\n\n3x\n- 1m 300w").preamble).toBe("Intent.");
  });

  it("ends at a section header, which is structure rather than prose", () => {
    expect(parser.parse("Intent.\n\nWarmup\n- 10m 150w").preamble).toBe(
      "Intent."
    );
  });

  it("ends at a step line the platform drops — it is still a step line", () => {
    expect(parser.parse("Intent.\n- MAX effort\n- 1m 100w").preamble).toBe(
      "Intent."
    );
  });

  it("runs past a horizontal rule, which is not structure", () => {
    expect(parser.parse("Intent.\n\n---\n\n- 1m 100w").preamble).toBe(
      "Intent.\n\n---"
    );
  });

  it("is the whole text when there is no structure, and empty when there is no prose", () => {
    expect(parser.parse("Just notes.\n\nMore.").preamble).toBe(
      "Just notes.\n\nMore."
    );
    expect(parser.parse("- 10m 200w").preamble).toBe("");
  });
});

describe("workout-text parser — labelTerminator", () => {
  it("is undefined for a label the platform keeps whole", () => {
    expect(parser.labelTerminator("Warmup")).toBeUndefined();
    expect(parser.labelTerminator("Rep 1")).toBeUndefined();
    expect(parser.labelTerminator("Ramp to failure")).toBeUndefined();
  });

  it("names the number-with-a-unit that cuts the label short", () => {
    expect(parser.labelTerminator("MAP — best 60s")).toBe("60s");
  });

  it("names a zone that clears the label", () => {
    expect(parser.labelTerminator("Easy Z2 spin")).toBe("Z2");
  });
});

describe("workout-text parser — resolveZones", () => {
  const anchors = {
    ftp: ZONE_TARGETS.harvest.ftp,
    powerZones: ZONE_TARGETS.harvest.powerZones,
  };

  it("rewrites a zone target to its watt band, inside repeats too", () => {
    const { doc } = parser.parse("3x\n- 1m Z2\n- 1m 150w");
    const resolved = parser.resolveZones(doc, anchors);
    const [zone, watts] = resolved.steps?.[0].steps ?? [];
    const band = parser.resolvePower(
      { units: "power_zone", value: 2 },
      anchors
    ).target;
    expect(zone.power).toMatchObject({
      units: "w",
      start: band?.low,
      end: band?.high,
    });
    expect(watts.power).toEqual({ units: "w", value: 150 });
  });

  it("leaves a zone it cannot resolve in place", () => {
    const { doc } = parser.parse("- 1m Z2");
    expect(parser.resolveZones(doc, {}).steps?.[0].power).toEqual({
      units: "power_zone",
      value: 2,
    });
  });
});

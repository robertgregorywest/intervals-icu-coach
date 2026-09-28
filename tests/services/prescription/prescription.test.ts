import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createPrescription } from "../../../src/services/prescription/index.js";
import { WORK_WORDS } from "../../../src/work-words.js";
import type { WorkoutDoc } from "../../../src/types.js";

const prescription = createPrescription();
const FTP = 300;
const FLOOR = 264; // 88% of FTP
const ANCHORS = { ftp: FTP, powerZones: [55, 75, 90, 105, 120, 150, 999] };

function fixture(name: string) {
  const path = fileURLToPath(
    new URL(`../../fixtures/session-review/${name}.json`, import.meta.url)
  );
  return JSON.parse(readFileSync(path, "utf8"));
}

/** One step of workout text, read with FTP and zones. */
function readOne(line: string, anchors = ANCHORS) {
  return prescription.read(line, anchors).steps[0]!;
}

describe("read — the pipeline", () => {
  it("reads workout text into resolved, role-tagged Planned steps", () => {
    const { steps, basis } = prescription.read(
      [
        "- Warm-up 10m 50%",
        "",
        "2x",
        "- Threshold 8m Z4",
        "- Easy 2m 150w",
      ].join("\n"),
      ANCHORS
    );

    expect(basis.source).toBe("local-parse");
    expect(steps.map((s) => [s.label, s.role, s.midpointWatts])).toEqual([
      ["Warm-up", "unclassified", 150],
      ["Threshold", "work", 293],
      ["Easy", "unclassified", 150],
      ["Threshold", "work", 293],
      ["Easy", "unclassified", 150],
    ]);
    expect(steps[1]).toMatchObject({ repIndex: 1, repCount: 2, stepInRep: 1 });
  });

  it("takes a platform document as it is, and says so", () => {
    const doc: WorkoutDoc = {
      steps: [
        {
          text: "Tempo",
          duration: 600,
          power: { start: 220, end: 240, units: "w" },
        },
      ],
    };
    const { steps, basis, discarded } = prescription.read(doc, ANCHORS);
    expect(basis).toEqual({ source: "platform" });
    expect(discarded).toEqual([]);
    expect(steps[0]).toMatchObject({ role: "work", midpointWatts: 230 });
  });

  it("reads nothing from nothing", () => {
    const read = prescription.read(undefined);
    expect(read.steps).toEqual([]);
    expect(read.totalSeconds).toBe(0);
    expect(read.keySession).toBe(false);
    expect(read.unreviewable).toEqual([]);
  });

  it("reads an event with no structured steps as empty", () => {
    const { event } = fixture("no-structured-steps");
    expect(prescription.read(event.workout_doc).steps).toEqual([]);
  });
});

describe("read — targets", () => {
  it("keeps the half watt on a band's midpoint", () => {
    expect(readOne("- Tempo 10m 200w-245w").midpointWatts).toBe(222.5);
  });

  it("preserves a band rather than collapsing it to a midpoint", () => {
    expect(readOne("- Tempo 10m 180w-215w").target).toEqual({
      low: 180,
      high: 215,
    });
  });

  it("treats a degenerate band as a point target", () => {
    const doc: WorkoutDoc = {
      steps: [{ duration: 60, power: { units: "w", start: 200, end: 200 } }],
    };
    expect(prescription.read(doc).steps[0]!.target).toEqual({ watts: 200 });
  });

  it("marks a ramp's ends as a ramp, not an acceptable band", () => {
    // Event 107665964: "Warmup — build gradually 20m ramp 130w-220w".
    const { event } = fixture("ramp-warmup");
    const { steps } = prescription.read(event.workout_doc as WorkoutDoc);

    expect(steps[0]!.target).toEqual({ low: 130, high: 220, ramp: true });
    expect(steps[0]!.midpointWatts).toBe(175);
    // The interval steps in the same workout are plain bands.
    expect(steps[1]!.target).toEqual({ low: 348, high: 375 });
  });

  it("resolves a percent target against FTP", () => {
    const doc: WorkoutDoc = {
      steps: [{ duration: 60, power: { units: "%", value: 90 } }],
    };
    expect(prescription.read(doc, { ftp: 290 }).steps[0]!.target).toEqual({
      watts: 261,
    });
  });

  it("names a percent target it has no FTP to resolve against", () => {
    const doc: WorkoutDoc = {
      steps: [{ duration: 60, power: { units: "%", value: 90 } }],
    };
    const [step] = prescription.read(doc).steps;
    expect(step!.target).toBeUndefined();
    expect(step!.midpointWatts).toBeUndefined();
    expect(step!.targetUnresolved).toMatch(/no FTP/);
  });

  it("names units it cannot convert", () => {
    const doc: WorkoutDoc = {
      steps: [{ duration: 60, power: { units: "hr", value: 150 } }],
    };
    const [step] = prescription.read(doc, { ftp: 290 }).steps;
    expect(step!.target).toBeUndefined();
    expect(step!.targetUnresolved).toMatch(/unsupported/);
  });

  it("names a zone target it has no zones to resolve against", () => {
    const step = readOne("- Push 5m Z4", { ftp: 300 } as typeof ANCHORS);
    expect(step.midpointWatts).toBeUndefined();
    expect(step.targetUnresolved).toBeDefined();
  });

  it("carries a point cadence and a cadence range as the platform shapes them", () => {
    const doc = {
      steps: [
        {
          duration: 150,
          power: { units: "w", start: 390, end: 410 },
          cadence: { units: "rpm", value: 100 },
        },
        {
          duration: 600,
          power: { units: "w", value: 180 },
          cadence: { units: "rpm", start: 85, end: 95 },
        },
        { duration: 300, power: { units: "w", value: 150 } },
      ],
    } as unknown as WorkoutDoc;
    const [point, range, none] = prescription.read(doc).steps;
    expect(point!.cadence).toBe(100);
    expect(point!.cadenceRange).toBeUndefined();
    expect(range!.cadence).toBeUndefined();
    expect(range!.cadenceRange).toEqual({ low: 85, high: 95 });
    expect(none!.cadence).toBeUndefined();
    expect(none!.cadenceRange).toBeUndefined();
  });
});

describe("read — repeats and duration", () => {
  it("expands a repeat block into one step per rep per inner step", () => {
    // Real event 107665970: 3× a 10-rep 30/30 block, plus surrounding steps.
    const { event } = fixture("vo2-repeats");
    const { steps } = prescription.read(event.workout_doc as WorkoutDoc);

    // 15 doc entries: 12 simple + 3 repeat blocks of 10 reps × 2 steps.
    expect(steps.length).toBe(12 + 3 * 10 * 2);

    const block = steps.filter((s) => s.repCount === 10);
    expect(block.length).toBe(60);
    expect(block[0]).toMatchObject({ repIndex: 1, stepInRep: 1 });
    expect(block[1]).toMatchObject({ repIndex: 1, stepInRep: 2 });
    expect(block[2]!.repIndex).toBe(2);
    expect(block[19]).toMatchObject({ repIndex: 10, stepInRep: 2 });
  });

  it("assigns contiguous indices and keeps the originating doc index", () => {
    // Real event 123780516: warm-up, 3×(12min work / 4min recovery), cooldown.
    const { event } = fixture("sweet-spot-3x12");
    const { steps, totalSeconds } = prescription.read(
      event.workout_doc as WorkoutDoc
    );

    expect(steps.map((s) => s.durationSeconds)).toEqual([
      720, 720, 240, 720, 240, 720, 240, 600,
    ]);
    expect(totalSeconds).toBe(720 + 3 * (720 + 240) + 600);
    expect(steps.map((s) => s.index)).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
    // All six repeat-block steps trace back to doc entry 1.
    expect(steps.slice(1, 7).every((s) => s.sourceIndex === 1)).toBe(true);
    expect(steps[7]!.sourceIndex).toBe(2);
    expect(steps[1]!.target).toEqual({ low: 255, high: 275 });
    expect(steps[5]).toMatchObject({ repIndex: 3, stepInRep: 1 });
  });

  it("recurses into nested repeat blocks rather than dropping them", () => {
    const doc: WorkoutDoc = {
      steps: [
        {
          reps: 2,
          steps: [
            {
              reps: 3,
              steps: [{ duration: 30, power: { units: "w", value: 400 } }],
            },
            { duration: 60, power: { units: "w", value: 150 } },
          ],
        },
      ],
    };
    const { steps, totalSeconds } = prescription.read(doc);

    // 2 × (3 inner + 1) = 8 steps, none lost.
    expect(steps.length).toBe(8);
    expect(totalSeconds).toBe(2 * (3 * 30 + 60));
  });
});

describe("read — the Work step role", () => {
  it("reads the first word only, so a prose label still declares its role", () => {
    expect(
      readOne(
        "- Threshold. Sit at the top of sweet spot and hold it even 20m 280w"
      ).role
    ).toBe("work");
  });

  it("normalises the punctuation and casing a label actually carries", () => {
    expect(readOne("- SST — hold the band 10m 250w").role).toBe("work");
    expect(readOne("- VO2 3m 350w").role).toBe("work");
    expect(readOne("- Pre-load 1m 300w").role).toBe("work");
    expect(readOne("- Warm-up 10m 150w").role).toBe("unclassified");
  });

  it("declares the support steps of a session as nothing at all", () => {
    for (const label of [
      "Recovery",
      "Easy",
      "Easy spin",
      "Cool down",
      "Rest or roll",
      "Off",
    ]) {
      expect(readOne(`- ${label} 5m 150w`).role, label).toBe("unclassified");
    }
  });

  it("treats an unrecognised or missing label as undeclared, not as work", () => {
    // The step is carried and counted; it is never judged. A silent
    // classification is the one outcome this vocabulary exists to prevent.
    expect(readOne("- Build one 5m 200w").role).toBe("unclassified");
    expect(readOne("- 5m 200w").role).toBe("unclassified");
  });

  it("holds the over-under halves as work, both of them", () => {
    for (const label of ["Over", "Under", "Float"]) {
      expect(readOne(`- ${label} 2m 280w`).role, label).toBe("work");
    }
  });

  it("classifies every word in the vocabulary as work", () => {
    for (const word of WORK_WORDS) {
      const doc: WorkoutDoc = {
        steps: [{ text: word, duration: 60, power: { units: "w", value: 1 } }],
      };
      expect(prescription.read(doc).steps[0]!.role, word).toBe("work");
    }
  });
});

describe("read — the key-session floor", () => {
  it("sets the floor at 88% of the anchors' FTP", () => {
    expect(prescription.keySessionFloorPctFtp).toBe(88);
    expect(prescription.read("- 5m 200w", ANCHORS).keyFloorWatts).toBe(FLOOR);
  });

  it("has no floor, and so no key session and no warning, without FTP", () => {
    const read = prescription.read("- Threshold 20m 280w\n- 20m 280w");
    expect(read.keyFloorWatts).toBeUndefined();
    expect(read.keySession).toBe(false);
    expect(read.unreviewable).toEqual([]);
  });

  it("calls a session key when a work step sits at or above the floor", () => {
    expect(prescription.read("- Threshold 20m 264w", ANCHORS).keySession).toBe(
      true
    );
  });

  it("does not call a session key on a hard step that declares no work", () => {
    // A warm-up ramp topping out at threshold must not pull an endurance ride
    // into the review.
    expect(
      prescription.read("- Warm-up 10m 290w\n- Endurance 60m 200w", ANCHORS)
        .keySession
    ).toBe(false);
  });

  it("does not call a session key on work below the floor", () => {
    expect(prescription.read("- Tempo 20m 240w", ANCHORS).keySession).toBe(
      false
    );
  });
});

describe("read — unreviewable steps", () => {
  it("names a hard step whose label declares no work role", () => {
    const { unreviewable } = prescription.read(
      ["- Warm-up 15m 160w", "- 20m 280w", "- Cooldown 10m 140w"].join("\n"),
      ANCHORS
    );
    expect(unreviewable).toEqual([{ index: 1, label: undefined, watts: 280 }]);
  });

  it("says nothing about a hard step that declares itself", () => {
    expect(
      prescription.read("- Threshold 20m 280w", ANCHORS).unreviewable
    ).toEqual([]);
  });

  it("says nothing about an easy step, labelled or not", () => {
    expect(
      prescription.read("- Recovery 5m 150w\n- 45m 200w", ANCHORS).unreviewable
    ).toEqual([]);
  });

  it("takes a band at its midpoint", () => {
    expect(
      prescription.read("- Chunk 12m 255w-285w", ANCHORS).unreviewable
    ).toEqual([{ index: 0, label: "Chunk", watts: 270 }]);
  });

  it("resolves a percent target against FTP", () => {
    const [step] = prescription.read(
      "- Push one 20m 95%",
      ANCHORS
    ).unreviewable;
    expect(step?.watts).toBe(285);
  });

  // Regression: the warning used to skip zone resolution, so a work step
  // written as a zone never got a watt target and was silently left out.
  it("resolves a zone target before judging it", () => {
    // Z4 of 300 W resolves to 271-315 W, midpoint 293 W.
    expect(prescription.read("- Push 20m Z4", ANCHORS).unreviewable).toEqual([
      { index: 0, label: "Push", watts: 293 },
    ]);
  });

  it("judges against the same unrounded midpoint the key session is selected on", () => {
    // 263-264 W has a midpoint of 263.5, under the 264 W floor — rounding it
    // up would warn on a step the digest does not select.
    expect(
      prescription.read("- Chunk 12m 263w-264w", ANCHORS).unreviewable
    ).toEqual([]);
    expect(
      prescription.read("- Threshold 12m 263w-264w", ANCHORS).keySession
    ).toBe(false);
  });
});

describe("shape", () => {
  it("expands repeats and counts distance steps without timing them", () => {
    expect(
      prescription.shape("- 10m 200w\n\n2x\n- 1km 300w\n- 1m 150w")
    ).toEqual({
      stepCount: 5,
      totalSeconds: 600 + 2 * 60,
      hasDistance: true,
    });
  });

  it("reads text with no step lines as no steps", () => {
    expect(prescription.shape("Just a note about the ride.")).toEqual({
      stepCount: 0,
      totalSeconds: 0,
      hasDistance: false,
    });
  });
});

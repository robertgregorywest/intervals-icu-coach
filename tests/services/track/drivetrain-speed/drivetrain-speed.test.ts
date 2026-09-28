import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import type { IActivitiesApi } from "../../../../src/services/activities/index.js";
import {
  createFitCodec,
  type FitRecord,
} from "../../../../src/services/fit/index.js";
import {
  createDrivetrainSpeedFit,
  DEFAULT_OUTPUT_DIR,
} from "../../../../src/services/track/drivetrain-speed/drivetrain-speed.js";
import {
  createTrack,
  TrackAlignmentError,
  TrackInputError,
  type DrivetrainSpeedInput,
  type TrackLapAlignmentResult,
} from "../../../../src/services/track/index.js";
import { loadTrackSessionRecords } from "../../../../src/services/track/records/loader.js";

const fit = createFitCodec();

const RECORDS = fileURLToPath(
  new URL("../../../fixtures/track-sessions", import.meta.url)
);

/** Run 1 of the 12 Jul session on the BOLT, sensor speed included — see the fit tests. */
function fixture(): Uint8Array {
  return new Uint8Array(
    readFileSync(
      fileURLToPath(
        new URL(
          "../../../fixtures/drivetrain-speed/track-2026-07-12-run-1.fit",
          import.meta.url
        )
      )
    )
  );
}

/** 65x16 on a 2099 mm rollout. */
const DEV_110 = (65 / 16) * 2.099;

/**
 * Run 1 placed where the real alignment puts it on the full recording
 * (2513.1 s), less the 2483 s the fixture's trim removed from its front.
 */
function alignmentOfRun1(): TrackLapAlignmentResult {
  const start = 2513.1 - 2483;
  const laps = [16.36, 16.23, 16.11, 16.1, 16.09, 16.24];
  let at = start;
  return {
    activityId: "i164949895",
    lapDistanceMeters: 250,
    samplingIntervalSeconds: 1,
    runs: [
      {
        run: "run-1",
        startOffsetSeconds: start,
        durationSeconds: 97.13,
        distanceMeters: 1500,
        fittedRolloutMeters: 8.4892,
        confidence: {
          residualRpm: 0.4,
          offsetIntervalSeconds: [start - 0.3, start + 0.3],
          verdict: "strong",
          lapsFitted: 6,
          lapsExcluded: 0,
        },
        average: {},
        laps: laps.map((lapTimeSeconds, index) => {
          const lap = {
            index,
            lapTimeSeconds,
            startSeconds: at,
            endSeconds: at + lapTimeSeconds,
            reading: {},
          };
          at += lapTimeSeconds;
          return lap;
        }),
      },
    ],
    thresholds: {
      strongResidualRpm: 1,
      marginalResidualRpm: 2,
      ambiguousResidualRatio: 1.05,
      minSamplesPerLap: 8,
    },
  };
}

/**
 * The operation over fakes: the alignment has its own tests, so here it only
 * supplies windows. One test goes through `createTrack` to prove the wiring.
 */
function setUp(
  options: {
    file?: Uint8Array | null;
    align?: () => Promise<TrackLapAlignmentResult>;
  } = {}
) {
  const written: Array<{ path: string; bytes: Uint8Array }> = [];
  const activitiesApi = {
    getActivityFile: async () =>
      options.file === undefined ? fixture() : options.file,
  } as unknown as IActivitiesApi;
  const deps = {
    activitiesApi,
    fit,
    align:
      options.align ??
      (async () => {
        throw new Error("not aligned in this test");
      }),
    records: () => loadTrackSessionRecords(RECORDS).records,
    writeFile: async (path: string, bytes: Uint8Array) => {
      written.push({ path, bytes });
    },
  };
  const track = {
    drivetrainSpeed: (input: DrivetrainSpeedInput) =>
      createDrivetrainSpeedFit(deps, input),
  };
  return { track, written, deps };
}

describe("Track.drivetrainSpeed", () => {
  it("writes the rewritten file where asked, with Drivetrain speed on every pedalled record", async () => {
    const { track, written } = setUp();
    const result = await track.drivetrainSpeed({
      activityId: "i164949895",
      gear: "65x16",
      outputPath: "/tmp/out.fit",
    });

    expect(written).toHaveLength(1);
    expect(written[0].path).toBe("/tmp/out.fit");
    expect(result.outputPath).toBe("/tmp/out.fit");
    expect(result.development).toMatchObject({
      gear: "65x16",
      rolloutMm: 2099,
      source: "gear",
    });
    expect(result.development.meters).toBeCloseTo(DEV_110, 3);

    const out = fit.readRecords(written[0].bytes);
    for (const r of out) {
      if (r.cadence === null) continue;
      expect(r.speed).toBeCloseTo((DEV_110 * r.cadence) / 60, 2);
    }
    expect(result.recording.records).toBe(158);
  });

  it("is reached through the Track module, defaulting the output into out/fit/", async () => {
    const { deps } = setUp();
    const track = createTrack({
      activitiesApi: deps.activitiesApi,
      fit,
      load: () => loadTrackSessionRecords(RECORDS),
      writeFile: deps.writeFile,
    });
    const result = await track.drivetrainSpeed({
      activityId: 164949895,
      gear: "65x16",
    });
    expect(result.outputPath).toBe(
      resolve(DEFAULT_OUTPUT_DIR, "i164949895-drivetrain-speed.fit")
    );
  });

  it("reports the sensor it replaced as a cross-check", async () => {
    const { track } = setUp();
    const { sensor } = await track.drivetrainSpeed({
      activityId: "i164949895",
      gear: "65x16",
    });
    expect(sensor).toBeDefined();
    // The sensor reads ~0.6% over the true 8.527 m/rev (track-context.md §1).
    expect(sensor!.sensorImpliedDevelopmentMeters).toBeGreaterThan(8.53);
    expect(sensor!.speedDifferencePercent.median).toBeLessThan(0);
  });

  it("takes the gear from a session record, and lets an argument override it", async () => {
    const { track } = setUp({ align: async () => alignmentOfRun1() });
    const fromRecord = await track.drivetrainSpeed({
      activityId: "i164949895",
      sessionId: "2026-07-12-training",
    });
    expect(fromRecord.development.gear).toBe("65x16");

    const overridden = await track.drivetrainSpeed({
      activityId: "i164949895",
      sessionId: "2026-07-12-training",
      gear: "64x16",
    });
    expect(overridden.development.meters).toBeCloseTo(4 * 2.099, 4);
  });

  it("checks each run's distance against the splits, beside the sensor's", async () => {
    const { track } = setUp({ align: async () => alignmentOfRun1() });
    const { splits } = await track.drivetrainSpeed({
      activityId: "i164949895",
      sessionId: "2026-07-12-training",
    });

    expect(splits).toBeDefined();
    const [run] = splits!.runs;
    expect(run).toMatchObject({
      run: "run-1",
      verdict: "strong",
      scoredDistanceMeters: 1500,
    });
    expect(run.fittedDevelopmentMeters).toBe(8.4892);
    expect(run.laps).toHaveLength(6);
    // Measured on the full file: +0.45% for the drivetrain, +1.1% for the sensor.
    expect(Math.abs(run.errorPercent)).toBeLessThan(1);
    expect(run.sensorErrorPercent!).toBeGreaterThan(run.errorPercent);
  });

  it("still writes the file when the splits cannot be aligned, and says why", async () => {
    const { track, written } = setUp({
      align: async () => {
        throw new TrackAlignmentError("no candidate window");
      },
    });
    const result = await track.drivetrainSpeed({
      activityId: "i164949895",
      sessionId: "2026-07-12-training",
    });
    expect(written).toHaveLength(1);
    expect(result.splits).toBeUndefined();
    expect(result.notes).toEqual(["No splits comparison: no candidate window"]);
  });

  it("refuses without a gear", async () => {
    const { track } = setUp();
    await expect(track.drivetrainSpeed({ activityId: "i1" })).rejects.toThrow(
      TrackInputError
    );
  });

  it("refuses gear inches", async () => {
    const { track } = setUp();
    await expect(
      track.drivetrainSpeed({ activityId: "i1", gear: "110" })
    ).rejects.toThrow(/chainring x cog/);
  });

  it("refuses without an activity when the record carries none", async () => {
    const { track } = setUp();
    await expect(
      track.drivetrainSpeed({ sessionId: "2026-07-12-training" })
    ).rejects.toThrow(/activityId is required/);
  });

  it("refuses an activity with no original upload", async () => {
    const { track } = setUp({ file: null });
    await expect(
      track.drivetrainSpeed({ activityId: "i1", gear: "65x16" })
    ).rejects.toThrow(/no original upload/);
  });
});

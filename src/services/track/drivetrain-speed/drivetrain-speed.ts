/**
 * Writing **Drivetrain speed** into a track recording made without a speed
 * sensor, and reporting how far to trust it.
 *
 * The original upload is fetched, its records get speed and distance through
 * the FIT codec's `rewriteSpeed` (which knows nothing about gears), and the file is written
 * locally for the athlete to upload. Any speed the file already carried is
 * replaced and becomes the sensor side of the comparison — which is also how
 * the method is tested: a file that had a sensor is its own control.
 */

import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { IActivitiesApi } from "../../activities/index.js";
import { normalizeActivityId } from "../../../shared/activity-id.js";
import type { IFitCodec } from "../../fit/index.js";
import { TrackAlignmentError } from "../alignment/align.js";
import type {
  TrackLapAlignmentResult,
  TrackLapPowerOptions,
} from "../alignment/types.js";
import { resolveTrackInput, TrackInputError } from "../input.js";
import { developmentFromBasis } from "../records/derive.js";
import { round } from "../../../shared/round.js";
import { RATE_DP } from "../records/precision.js";
import type { SessionBasis, TrackSessionRecord } from "../records/types.js";
import {
  compareWithSensor,
  compareWithSplits,
  sensorStream,
} from "./compare.js";
import { computeDrivetrainSpeed } from "./speed.js";
import type { DrivetrainSpeedInput, DrivetrainSpeedResult } from "./types.js";

const DEFAULT_ROLLOUT_MM = 2099;

/** `out/fit/` at the repo root — gitignored. Module-relative, as the records dir is. */
export const DEFAULT_OUTPUT_DIR = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../../../out/fit"
);

export interface DrivetrainSpeedDeps {
  activitiesApi: IActivitiesApi;
  fit: IFitCodec;
  align: (options: TrackLapPowerOptions) => Promise<TrackLapAlignmentResult>;
  records: () => TrackSessionRecord[];
  writeFile: (path: string, bytes: Uint8Array) => Promise<void>;
}

export async function createDrivetrainSpeedFit(
  deps: DrivetrainSpeedDeps,
  input: DrivetrainSpeedInput
): Promise<DrivetrainSpeedResult> {
  const record = input.sessionId
    ? findRecord(deps.records(), input.sessionId)
    : undefined;

  const development = resolveDevelopment(input, record?.basis);
  const rawId = input.activityId ?? record?.basis.activityId;
  if (rawId === undefined) {
    throw new TrackInputError(
      "activityId is required" +
        (record ? ` — track session "${record.basis.id}" carries none.` : ".")
    );
  }
  const activityId = normalizeActivityId(rawId);

  const bytes = await deps.activitiesApi.getActivityFile(activityId);
  if (!bytes) {
    throw new TrackInputError(
      `Activity ${activityId} has no original upload to rewrite (a Strava-synced ` +
        "activity carries none)."
    );
  }

  const records = deps.fit.readRecords(bytes);
  const stream = computeDrivetrainSpeed(
    records,
    development.meters,
    input.onTrack
  );
  const rewritten = deps.fit.rewriteSpeed(bytes, stream.values);

  const outputPath = resolve(
    input.outputPath ??
      resolve(DEFAULT_OUTPUT_DIR, `${activityId}-drivetrain-speed.fit`)
  );
  await deps.writeFile(outputPath, rewritten);

  const notes: string[] = [];
  const sensor = sensorStream(stream, records);

  let splits: DrivetrainSpeedResult["splits"];
  if (record) {
    try {
      // Intervals.icu's `time` stream is the FIT record timestamp less the
      // first one, so the alignment's windows index this stream directly.
      const alignment = await deps.align(
        resolveTrackInput({ sessionId: record.basis.id, activityId }, () => [
          record,
        ])
      );
      splits = compareWithSplits(record.basis.id, alignment, stream, sensor);
    } catch (error) {
      if (!(error instanceof TrackAlignmentError)) throw error;
      notes.push(`No splits comparison: ${error.message}`);
    }
  }

  const speeds = stream.values.flatMap((v) =>
    v.speed === null ? [] : [v.speed]
  );
  const last = stream.values[stream.values.length - 1];
  const finalSpeed = last?.speed ?? 0;
  const lastHold = stream.holds[stream.holds.length - 1] ?? 0;

  if (stream.counts.withSpeed === 0) {
    notes.push(
      "No sample carried cadence inside the on-track ranges — no speed was written."
    );
  }

  return {
    activityId,
    outputPath,
    development: {
      meters: round(development.meters, RATE_DP + 1),
      ...(development.gear && { gear: development.gear }),
      ...(development.source === "gear" && {
        rolloutMm: development.rolloutMm,
      }),
      source: development.source,
    },
    recording: {
      ...stream.counts,
      pausedSeconds: round(stream.counts.pausedSeconds, 1),
      samplingIntervalSeconds: stream.samplingIntervalSeconds,
    },
    totals: {
      distanceMeters: round((last?.distance ?? 0) + finalSpeed * lastHold, 1),
      ...(speeds.length > 0 && {
        maxSpeedMetersPerSecond: round(Math.max(...speeds), RATE_DP),
      }),
    },
    ...(sensor && { sensor: compareWithSensor(stream, sensor, records) }),
    ...(splits && { splits }),
    ...(notes.length > 0 && { notes }),
  };
}

function findRecord(
  records: TrackSessionRecord[],
  sessionId: string
): TrackSessionRecord {
  const record = records.find((r) => r.basis.id === sessionId);
  if (!record) {
    const available = records.map((r) => r.basis.id).join(", ");
    throw new TrackInputError(
      `No track session record with id "${sessionId}".` +
        (available ? ` Available: ${available}.` : " No records are loaded.")
    );
  }
  return record;
}

/**
 * The arguments override the record. A supplied `gear` also overrides a
 * record's `developmentMeters`, which exists for sessions whose gear is unknown.
 */
function resolveDevelopment(
  input: DrivetrainSpeedInput,
  basis: SessionBasis | undefined
): {
  meters: number;
  gear?: string;
  rolloutMm: number;
  source: "gear" | "supplied";
} {
  const gear = input.gear ?? basis?.gear;
  const rolloutMm = input.rolloutMm ?? basis?.rolloutMm ?? DEFAULT_ROLLOUT_MM;
  const developmentMeters = input.gear ? undefined : basis?.developmentMeters;

  const development = developmentFromBasis({
    gear,
    rolloutMm,
    developmentMeters,
  } as SessionBasis);
  if (!development) {
    throw new TrackInputError(
      gear
        ? `Gear "${gear}" is not "chainring x cog" (e.g. "64x16").`
        : 'No gear: pass gear (e.g. "64x16"), or a sessionId whose record has one.'
    );
  }
  return { ...development, gear, rolloutMm };
}

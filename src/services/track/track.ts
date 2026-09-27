import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import type { IActivitiesApi } from "../activities/index.js";
import { computeTrackLapPower } from "./alignment/align.js";
import type { TrackLapAlignmentResult } from "./alignment/types.js";
import { writeTrackRuns } from "./writeback/writeback.js";
import type { TrackRunWriteResult } from "./writeback/types.js";
import {
  loadTrackSessionRecords,
  type LoadedRecords,
} from "./records/loader.js";
import {
  compareSessions,
  getSession,
  listSessions,
} from "./records/records.js";
import type {
  CompareTrackSessionsOptions,
  GetTrackSessionOptions,
  ListTrackSessionsResult,
  RunComparison,
  TrackSessionDetail,
} from "./records/types.js";
import { resolveTrackInput } from "./input.js";
import { createDrivetrainSpeedFit } from "./drivetrain-speed/drivetrain-speed.js";
import type {
  DrivetrainSpeedInput,
  DrivetrainSpeedResult,
} from "./drivetrain-speed/types.js";
import type { ITrack, TrackInput, TrackWriteInput } from "./types.js";

export interface TrackDeps {
  /** Streams to align against, and the intervals a write replaces. */
  activitiesApi: IActivitiesApi;
  /** Overridden in tests; production reads the records directory. */
  load?: () => LoadedRecords;
  /** Overridden in tests; production writes the file, creating its directory. */
  writeFile?: (path: string, bytes: Uint8Array) => Promise<void>;
}

/**
 * The records touch no Intervals.icu endpoint — listing, reading and comparing
 * them needs no API key. Only `align`, `write` and `drivetrainSpeed` reach the
 * activity, and `drivetrainSpeed` only reads it: its output is a local file.
 */
export class Track implements ITrack {
  private activitiesApi: IActivitiesApi;
  private load: () => LoadedRecords;
  private writeFile: (path: string, bytes: Uint8Array) => Promise<void>;

  constructor(deps: TrackDeps) {
    this.activitiesApi = deps.activitiesApi;
    this.load = deps.load ?? (() => loadTrackSessionRecords());
    this.writeFile =
      deps.writeFile ??
      (async (path, bytes) => {
        await mkdir(dirname(path), { recursive: true });
        await writeFile(path, bytes);
      });
  }

  async align(input: TrackInput): Promise<TrackLapAlignmentResult> {
    return computeTrackLapPower(
      { activitiesApi: this.activitiesApi },
      this.resolve(input)
    );
  }

  async write(input: TrackWriteInput): Promise<TrackRunWriteResult> {
    return writeTrackRuns(
      {
        activitiesApi: this.activitiesApi,
        align: (options) =>
          computeTrackLapPower({ activitiesApi: this.activitiesApi }, options),
      },
      { ...this.resolve(input), preview: input.preview }
    );
  }

  async drivetrainSpeed(
    input: DrivetrainSpeedInput
  ): Promise<DrivetrainSpeedResult> {
    return createDrivetrainSpeedFit(
      {
        activitiesApi: this.activitiesApi,
        align: (options) =>
          computeTrackLapPower({ activitiesApi: this.activitiesApi }, options),
        records: () => this.load().records,
        writeFile: this.writeFile,
      },
      input
    );
  }

  async listSessions(): Promise<ListTrackSessionsResult> {
    return listSessions(this.load());
  }

  async getSession(
    options: GetTrackSessionOptions
  ): Promise<TrackSessionDetail> {
    return getSession(this.load().records, options);
  }

  async compareSessions(
    options: CompareTrackSessionsOptions
  ): Promise<RunComparison> {
    return compareSessions(this.load().records, options);
  }

  private resolve(input: TrackInput) {
    return resolveTrackInput(input, () => this.load().records);
  }
}

export function createTrack(deps: TrackDeps): Track {
  return new Track(deps);
}

import type { TrackLapAlignmentResult } from "./alignment/types.js";
import type { TrackRunWriteResult } from "./writeback/types.js";
import type {
  CompareTrackSessionsOptions,
  GetTrackSessionOptions,
  ListTrackSessionsResult,
  RunComparison,
  TrackSessionDetail,
} from "./records/types.js";

/**
 * What a run's alignment is fitted from: a stored record, or the lap-timer
 * export pasted with the ride it was timed on.
 *
 * A record is preferred — its splits come back re-serialised from the parse
 * that already reconciled them, so the export is never transcribed twice. Its
 * `activityId` and `lapDistanceMeters` come from the record's basis; either
 * may be supplied to override it, and `activityId` must be when the record has
 * none (a race timed with no ride behind it).
 */
export type TrackInput =
  | {
      sessionId: string;
      activityId?: string | number;
      lapDistanceMeters?: number;
    }
  | {
      /** The export, pasted as exported. */
      splits: string;
      activityId: string | number;
      /** Defaults to 250 m. */
      lapDistanceMeters?: number;
    };

export type TrackWriteInput = TrackInput & {
  /** Compose everything, write nothing. */
  preview?: boolean;
};

/**
 * Timed track sessions: the records, and the join of their lap splits to the
 * ride's streams.
 *
 * `align` and `write` resolve their input the same way, so an alignment
 * previewed with `align` is the alignment `write` puts on the activity.
 */
export interface ITrack {
  /** Fit each run's laps to the streams and read power, cadence and HR. */
  align(input: TrackInput): Promise<TrackLapAlignmentResult>;
  /** Replace the activity's intervals with one per aligned run. */
  write(input: TrackWriteInput): Promise<TrackRunWriteResult>;

  listSessions(): Promise<ListTrackSessionsResult>;
  getSession(options: GetTrackSessionOptions): Promise<TrackSessionDetail>;
  compareSessions(options: CompareTrackSessionsOptions): Promise<RunComparison>;
}

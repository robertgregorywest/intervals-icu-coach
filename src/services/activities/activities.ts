import { HttpError, type IHttpClient } from "../../client.js";
import { decodeFitLaps, type FitLap } from "../fit/index.js";
import type {
  Activity,
  ActivityIntervalsDoc,
  ActivityStreams,
  IntervalWrite,
} from "./types.js";

export interface IActivitiesApi {
  getActivities(oldest: string, newest: string): Promise<Activity[]>;
  getActivity(id: string, includeIntervals?: boolean): Promise<Activity>;
  getActivityStreams(id: string, types?: string[]): Promise<ActivityStreams>;
  /**
   * The laps the recording device wrote, or `null` when they cannot be read.
   *
   * Unlike `icu_intervals` these are not derived and not editable: they are
   * what the athlete marked at the time. Only activities uploaded as a FIT file
   * have them — Strava-synced activities carry no original file.
   */
  getActivityLaps(id: string): Promise<FitLap[] | null>;
  /**
   * The original upload's bytes, or `null` when there is none (a
   * Strava-synced activity) or it cannot be fetched.
   */
  getActivityFile(id: string): Promise<Uint8Array | null>;
  /** The activity's interval analysis, as its own document. */
  getActivityIntervals(id: string): Promise<ActivityIntervalsDoc>;
  /**
   * Replace the activity's entire interval set with `intervals`.
   *
   * Replace rather than merge (`all=true`) is what makes writing twice the same
   * as writing once — a merge would leave the previous write's intervals
   * alongside the new ones with no handle to remove them.
   *
   * Intervals.icu backfills every stretch not covered by a supplied interval
   * with one of its own, so the document that comes back partitions the whole
   * activity and will hold more intervals than were sent.
   */
  replaceActivityIntervals(
    id: string,
    intervals: IntervalWrite[]
  ): Promise<ActivityIntervalsDoc>;
}

export class ActivitiesApi implements IActivitiesApi {
  private httpClient: IHttpClient;
  private athleteId: string;

  constructor(httpClient: IHttpClient, athleteId: string) {
    this.httpClient = httpClient;
    this.athleteId = athleteId;
  }

  async getActivities(oldest: string, newest: string): Promise<Activity[]> {
    return this.httpClient.request<Activity[]>(
      `/api/v1/athlete/${this.athleteId}/activities?oldest=${oldest}&newest=${newest}`
    );
  }

  async getActivity(id: string, includeIntervals = false): Promise<Activity> {
    const query = includeIntervals ? "?intervals=true" : "";
    return this.httpClient.request<Activity>(`/api/v1/activity/${id}${query}`);
  }

  /**
   * Fetch and decode the original upload's laps.
   *
   * Every failure mode collapses to `null` — no file (Strava sync), a
   * non-FIT upload, an unreadable record stream. The caller's job is to fall
   * back to the derived intervals, not to distinguish why the laps are absent.
   */
  async getActivityLaps(id: string): Promise<FitLap[] | null> {
    const bytes = await this.getActivityFile(id);
    return bytes ? decodeFitLaps(bytes) : null;
  }

  async getActivityFile(id: string): Promise<Uint8Array | null> {
    let bytes: Uint8Array;
    try {
      bytes = await this.httpClient.request<Uint8Array>(
        `/api/v1/activity/${id}/file`,
        { responseType: "binary" }
      );
    } catch (error) {
      if (error instanceof HttpError) return null;
      throw error;
    }
    if (!(bytes instanceof Uint8Array) || bytes.length === 0) return null;
    return bytes;
  }

  async getActivityStreams(
    id: string,
    types?: string[]
  ): Promise<ActivityStreams> {
    const query = types?.length ? `?types=${types.join(",")}` : "";
    const raw = await this.httpClient.request<unknown>(
      `/api/v1/activity/${id}/streams.json${query}`
    );
    return normalizeStreams(raw);
  }

  async getActivityIntervals(id: string): Promise<ActivityIntervalsDoc> {
    return this.httpClient.request<ActivityIntervalsDoc>(
      `/api/v1/activity/${id}/intervals`
    );
  }

  async replaceActivityIntervals(
    id: string,
    intervals: IntervalWrite[]
  ): Promise<ActivityIntervalsDoc> {
    // The body is a bare array, not an object wrapping one.
    return this.httpClient.request<ActivityIntervalsDoc>(
      `/api/v1/activity/${id}/intervals?all=true`,
      { method: "PUT", body: intervals }
    );
  }
}

function normalizeStreams(raw: unknown): ActivityStreams {
  // Intervals.icu returns an array of { type, data } stream objects;
  // the rest of the codebase expects a keyed object ({ watts, heartrate, ... }).
  if (Array.isArray(raw)) {
    const out: Record<string, unknown> = {};
    for (const entry of raw) {
      if (
        entry &&
        typeof entry === "object" &&
        typeof (entry as { type?: unknown }).type === "string"
      ) {
        const e = entry as { type: string; data?: unknown };
        out[e.type] = e.data;
      }
    }
    return out as ActivityStreams;
  }
  if (raw && typeof raw === "object") {
    return raw as ActivityStreams;
  }
  return {} as ActivityStreams;
}

export function createActivitiesApi(
  httpClient: IHttpClient,
  athleteId: string
): ActivitiesApi {
  return new ActivitiesApi(httpClient, athleteId);
}

import type { IHttpClient } from "../../client.js";
import type { IntervalsEvent } from "../../types.js";
import { dateRange } from "../../shared/date-range.js";

/**
 * Longest range a list read accepts, in days counting both ends: a season of
 * history, beyond which the payload is too large to be useful to the model.
 */
export const MAX_RANGE_DAYS = 365;

export interface IEventsApi {
  getEvents(
    oldest: string,
    newest: string,
    resolve?: boolean
  ): Promise<IntervalsEvent[]>;
  getEvent(eventId: number): Promise<IntervalsEvent>;
  createEvents(events: IntervalsEvent[]): Promise<IntervalsEvent[]>;
  updateEvent(
    eventId: number,
    data: Partial<IntervalsEvent>
  ): Promise<IntervalsEvent>;
  deleteEvent(eventId: number): Promise<void>;
  deleteEvents(
    ids: Array<{ external_id?: string; id?: number }>
  ): Promise<void>;
}

export class EventsApi implements IEventsApi {
  private httpClient: IHttpClient;
  private athleteId: string;

  constructor(httpClient: IHttpClient, athleteId: string) {
    this.httpClient = httpClient;
    this.athleteId = athleteId;
  }

  async getEvents(
    oldest: string,
    newest: string,
    resolve = false
  ): Promise<IntervalsEvent[]> {
    dateRange(oldest, newest, { maxDays: MAX_RANGE_DAYS });
    const resolveParam = resolve ? "&resolve=true" : "";
    return this.httpClient.request<IntervalsEvent[]>(
      `/api/v1/athlete/${this.athleteId}/events?oldest=${oldest}&newest=${newest}${resolveParam}`
    );
  }

  async getEvent(eventId: number): Promise<IntervalsEvent> {
    return this.httpClient.request<IntervalsEvent>(
      `/api/v1/athlete/${this.athleteId}/events/${eventId}`
    );
  }

  async createEvents(events: IntervalsEvent[]): Promise<IntervalsEvent[]> {
    return this.httpClient.request<IntervalsEvent[]>(
      `/api/v1/athlete/${this.athleteId}/events/bulk?upsert=true`,
      {
        method: "POST",
        body: events,
      }
    );
  }

  async updateEvent(
    eventId: number,
    data: Partial<IntervalsEvent>
  ): Promise<IntervalsEvent> {
    return this.httpClient.request<IntervalsEvent>(
      `/api/v1/athlete/${this.athleteId}/events/${eventId}`,
      {
        method: "PUT",
        body: data,
      }
    );
  }

  async deleteEvent(eventId: number): Promise<void> {
    await this.httpClient.request<void>(
      `/api/v1/athlete/${this.athleteId}/events/${eventId}`,
      {
        method: "DELETE",
      }
    );
  }

  async deleteEvents(
    ids: Array<{ external_id?: string; id?: number }>
  ): Promise<void> {
    await this.httpClient.request<void>(
      `/api/v1/athlete/${this.athleteId}/events/bulk-delete`,
      {
        method: "PUT",
        body: ids,
      }
    );
  }
}

export function createEventsApi(
  httpClient: IHttpClient,
  athleteId: string
): IEventsApi {
  return new EventsApi(httpClient, athleteId);
}

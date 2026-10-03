import type { IHttpClient } from "../../client.js";
import type { WellnessRecord } from "./types.js";
import { dateRange } from "../../shared/date-range.js";

/**
 * Longest range a list read accepts, in days counting both ends: a season of
 * history, beyond which the payload is too large to be useful to the model.
 */
export const MAX_RANGE_DAYS = 365;

export interface IWellnessApi {
  getWellness(oldest: string, newest: string): Promise<WellnessRecord[]>;
  getWellnessDay(date: string): Promise<WellnessRecord>;
}

export class WellnessApi implements IWellnessApi {
  private httpClient: IHttpClient;
  private athleteId: string;

  constructor(httpClient: IHttpClient, athleteId: string) {
    this.httpClient = httpClient;
    this.athleteId = athleteId;
  }

  async getWellness(oldest: string, newest: string): Promise<WellnessRecord[]> {
    dateRange(oldest, newest, { maxDays: MAX_RANGE_DAYS });
    return this.httpClient.request<WellnessRecord[]>(
      `/api/v1/athlete/${this.athleteId}/wellness?oldest=${oldest}&newest=${newest}`
    );
  }

  async getWellnessDay(date: string): Promise<WellnessRecord> {
    return this.httpClient.request<WellnessRecord>(
      `/api/v1/athlete/${this.athleteId}/wellness/${date}`
    );
  }
}

export function createWellnessApi(
  httpClient: IHttpClient,
  athleteId: string
): IWellnessApi {
  return new WellnessApi(httpClient, athleteId);
}

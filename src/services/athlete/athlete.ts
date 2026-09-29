import type { IHttpClient } from "../../client.js";

export interface AthleteProfile {
  id: string;
  name: string;
  email: string;
  ftp: number;
  lthr: number;
  max_hr: number;
  resting_hr: number;
  weight: number;
  sport_settings: SportSetting[];
  [key: string]: unknown;
}

export interface SportSetting {
  types: string[];
  ftp: number;
  lthr: number;
  max_hr: number;
  threshold_pace: number;
  // Zone boundaries (e.g. %FTP for power, bpm for HR). `null` when not configured for the sport.
  power_zones: number[] | null;
  hr_zones: number[] | null;
  pace_zones: number[] | null;
  [key: string]: unknown;
}

export interface IAthleteApi {
  getAthlete(): Promise<AthleteProfile>;
}

export class AthleteApi implements IAthleteApi {
  private httpClient: IHttpClient;
  private athleteId: string;

  constructor(httpClient: IHttpClient, athleteId: string) {
    this.httpClient = httpClient;
    this.athleteId = athleteId;
  }

  async getAthlete(): Promise<AthleteProfile> {
    return this.httpClient.request<AthleteProfile>(
      `/api/v1/athlete/${this.athleteId}`
    );
  }
}

export function createAthleteApi(
  httpClient: IHttpClient,
  athleteId: string
): IAthleteApi {
  return new AthleteApi(httpClient, athleteId);
}

import type { IHttpClient } from "../../client.js";
import type { PowerCurvePoint } from "./types.js";
import { extractPeaks, type PeakSet } from "./peaks.js";

export interface PowerCurveOptions {
  type?: string;
  range?: string;
}

export interface IPowerCurvesApi {
  getPowerCurve(options?: PowerCurveOptions): Promise<PowerCurvePoint[]>;
  /**
   * The 5s, 1min and 5min peaks off the same curve, each `null` where the
   * curve has no point at that duration. Throws when the curve will not load.
   */
  getPeaks(options?: PowerCurveOptions): Promise<PeakSet>;
}

export class PowerCurvesApi implements IPowerCurvesApi {
  private httpClient: IHttpClient;
  private athleteId: string;

  constructor(httpClient: IHttpClient, athleteId: string) {
    this.httpClient = httpClient;
    this.athleteId = athleteId;
  }

  async getPowerCurve(
    options: PowerCurveOptions = {}
  ): Promise<PowerCurvePoint[]> {
    const params = new URLSearchParams();
    if (options.type) params.set("type", options.type);
    if (options.range) params.set("curves", options.range);
    const query = params.toString();
    return this.httpClient.request<PowerCurvePoint[]>(
      `/api/v1/athlete/${this.athleteId}/power-curves-ext${query ? `?${query}` : ""}`
    );
  }

  async getPeaks(options: PowerCurveOptions = {}): Promise<PeakSet> {
    return extractPeaks(await this.getPowerCurve(options));
  }
}

export function createPowerCurvesApi(
  httpClient: IHttpClient,
  athleteId: string
): IPowerCurvesApi {
  return new PowerCurvesApi(httpClient, athleteId);
}

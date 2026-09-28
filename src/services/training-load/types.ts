import type { IActivitiesApi } from "../activities/index.js";
import type { IEventsApi } from "../events/index.js";
import type { IWellnessApi } from "../wellness/index.js";
import type { IAthleteAnchors } from "../athlete-anchors/index.js";
import type { IPrescription } from "../prescription/index.js";
import type { ForecastOptions, ForecastResult } from "./forecast/types.js";
import type { TrainingWeekSummary } from "./week/types.js";

export interface TrainingLoadDeps {
  activitiesApi: IActivitiesApi;
  wellnessApi: IWellnessApi;
  eventsApi: IEventsApi;
  /** FTP for each ride's middle band, and the forecast's threshold and time constants. */
  anchors: IAthleteAnchors;
  /** Reads each prescription into the steps its forecast load is derived from. */
  prescription: IPrescription;
  /** "Today" as YYYY-MM-DD; defaults to the system clock (UTC). */
  today?: () => string;
}

/**
 * Training load over Monday-to-Sunday weeks, with CTL/ATL read from wellness
 * and FTP from the anchors: what a week delivered, and what a set of proposed
 * sessions would do to the trajectory.
 */
export interface ITrainingLoad {
  /** The delivered week starting `weekStart` (a Monday); defaults to this week. */
  summarizeWeek(weekStart?: string): Promise<TrainingWeekSummary>;
  /**
   * The CTL/ATL/TSB trajectory of proposed sessions over already-planned work.
   * Throws for a window longer than `MAX_FORECAST_DAYS` or running backwards.
   */
  forecast(options: ForecastOptions): Promise<ForecastResult>;
}

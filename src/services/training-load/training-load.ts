import { TrainingLoadForecast } from "./forecast/forecast.js";
import type { ForecastOptions, ForecastResult } from "./forecast/types.js";
import { TrainingWeek } from "./week/week.js";
import type { TrainingWeekSummary } from "./week/types.js";
import type { ITrainingLoad, TrainingLoadDeps } from "./types.js";

export class TrainingLoad implements ITrainingLoad {
  private week: TrainingWeek;
  private forecaster: TrainingLoadForecast;

  constructor(deps: TrainingLoadDeps) {
    this.week = new TrainingWeek(deps);
    this.forecaster = new TrainingLoadForecast(deps);
  }

  summarizeWeek(weekStart?: string): Promise<TrainingWeekSummary> {
    return this.week.getTrainingWeekSummary(weekStart);
  }

  forecast(options: ForecastOptions): Promise<ForecastResult> {
    return this.forecaster.forecastTrainingLoad(options);
  }
}

export function createTrainingLoad(deps: TrainingLoadDeps): ITrainingLoad {
  return new TrainingLoad(deps);
}

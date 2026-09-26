import type { IActivitiesApi } from "../activities/index.js";
import { computeAerobicDecoupling } from "./decoupling.js";
import type { DecouplingResult } from "./decoupling.js";
import { compareIntervals } from "./intervals.js";
import type {
  CompareIntervalsResult,
  IntervalFilterOptions,
} from "./intervals.js";

export interface IActivityAnalysis {
  getAerobicDecoupling(activityId: string): Promise<DecouplingResult>;
  compareIntervals(
    activityIds: string[],
    options?: IntervalFilterOptions
  ): Promise<CompareIntervalsResult>;
}

export interface ActivityAnalysisDeps {
  activitiesApi: IActivitiesApi;
}

/** The pure analyses in this module, fed from recorded activities. */
export function createActivityAnalysis(
  deps: ActivityAnalysisDeps
): IActivityAnalysis {
  const { activitiesApi } = deps;
  return {
    async getAerobicDecoupling(activityId) {
      const streams = await activitiesApi.getActivityStreams(activityId, [
        "watts",
        "heartrate",
      ]);
      if (!streams.watts?.length) {
        throw new Error("No power data available for this activity");
      }
      if (!streams.heartrate?.length) {
        throw new Error("No heart rate data available for this activity");
      }
      return computeAerobicDecoupling(streams.watts, streams.heartrate);
    },

    async compareIntervals(activityIds, options) {
      const activities = await Promise.all(
        activityIds.map((id) => activitiesApi.getActivity(id, true))
      );
      return compareIntervals(activities, options);
    },
  };
}

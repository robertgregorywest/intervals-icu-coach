import type { IActivitiesApi } from "../activities/index.js";
import { computeAerobicDecoupling } from "./decoupling.js";
import type { DecouplingResult } from "./decoupling.js";
import { compareIntervals } from "./intervals.js";
import {
  MAX_SFT_RANGE_DAYS,
  SFT_BASELINE_DAYS,
  readSubmaxFatigueTests,
} from "./submax-fatigue.js";
import type { SubmaxFatigueTestsResult } from "./submax-fatigue.js";
import { dateRange } from "../../shared/date-range.js";
import { shiftDate } from "../../shared/dates.js";
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
  /**
   * The submaximal fatigue tests in `oldest..newest`, each against its
   * baseline, from one activity-list read reaching `SFT_BASELINE_DAYS` earlier.
   */
  getSubmaxFatigueTests(
    oldest: string,
    newest: string
  ): Promise<SubmaxFatigueTestsResult>;
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

    async getSubmaxFatigueTests(oldest, newest) {
      dateRange(oldest, newest, {
        maxDays: MAX_SFT_RANGE_DAYS,
        why:
          `Each test's baseline reaches ${SFT_BASELINE_DAYS} days earlier, ` +
          "inside the activity list's own cap.",
      });
      const activities = await activitiesApi.getActivities(
        shiftDate(oldest, -SFT_BASELINE_DAYS),
        newest
      );
      return readSubmaxFatigueTests(activities, oldest, newest);
    },
  };
}

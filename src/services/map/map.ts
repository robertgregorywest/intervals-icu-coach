import type { Activity, IActivitiesApi } from "../activities/index.js";
import { computeBestPower } from "../analysis/index.js";
import type { IMap, MapDerivation } from "./types.js";
import { daysBetween, shiftDate } from "../../dates.js";

const MAP_LOOKBACK_DAYS = 90;
const RAMP_TEST_NAME_PREFIX = "map ramp test";
const RAMP_TEST_SKIP_MARKER = "(skip)";

export interface MapDeps {
  activitiesApi: IActivitiesApi;
}

export function createMap(deps: MapDeps): IMap {
  return {
    deriveLatest: (today) => deriveLatestMap(deps.activitiesApi, today),
  };
}

async function deriveLatestMap(
  activitiesApi: IActivitiesApi,
  today: string
): Promise<MapDerivation> {
  const oldest = shiftDate(today, -(MAP_LOOKBACK_DAYS - 1));
  let activities: Activity[];
  try {
    activities = await activitiesApi.getActivities(oldest, today);
  } catch {
    return {
      map: null,
      mapWarning:
        `Could not load activities for MAP derivation. ` +
        `Ask the athlete for a current MAP estimate.`,
    };
  }

  const candidates = activities
    .filter((a) => isRampTest(a.name))
    .sort((a, b) =>
      String(b.start_date_local).localeCompare(String(a.start_date_local))
    );

  if (candidates.length === 0) {
    return {
      map: null,
      mapWarning:
        `No "MAP ramp test" activity found in the last ${MAP_LOOKBACK_DAYS} days. ` +
        `Ask the athlete for a current MAP estimate (typically 1-min peak from a ramp test).`,
    };
  }

  const test = candidates[0];
  const activityDate = String(test.start_date_local).slice(0, 10);
  const daysAgo = Math.max(0, daysBetween(activityDate, today) || 0);

  let stream;
  try {
    stream = await activitiesApi.getActivityStreams(test.id, ["watts"]);
  } catch {
    return {
      map: null,
      mapWarning:
        `Most recent ramp test ("${test.name}", ${activityDate}) ` +
        `could not be read. Ask the athlete for a current MAP estimate.`,
    };
  }

  const watts = stream.watts;
  if (!Array.isArray(watts) || watts.length === 0) {
    return {
      map: null,
      mapWarning:
        `Most recent ramp test ("${test.name}", ${activityDate}) ` +
        `has no power data. Ask the athlete for a current MAP estimate.`,
    };
  }

  const best = computeBestPower(watts, 60);
  if (!best) {
    return {
      map: null,
      mapWarning:
        `Most recent ramp test ("${test.name}", ${activityDate}) ` +
        `is shorter than 60 seconds of power data. Ask the athlete for a current MAP estimate.`,
    };
  }

  return {
    map: {
      watts: best.bestPower,
      computedFrom: {
        metric: "best_60s",
        activityId: test.id,
        activityName: test.name,
        activityDate,
        daysAgo,
      },
    },
  };
}

function isRampTest(name: unknown): boolean {
  if (typeof name !== "string") return false;
  const lower = name.toLowerCase();
  if (!lower.startsWith(RAMP_TEST_NAME_PREFIX)) return false;
  if (lower.includes(RAMP_TEST_SKIP_MARKER)) return false;
  return true;
}

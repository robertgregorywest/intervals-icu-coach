export type { IActivitiesApi, ActivitiesDeps } from "./activities.js";
export { ActivitiesApi, createActivitiesApi } from "./activities.js";
export type {
  Activity,
  ActivityInterval,
  ActivityIntervalsDoc,
  ActivityStreams,
  IntervalWrite,
} from "./types.js";
export {
  normalizeActivityId,
  compactIntervalAnalysis,
  packStreams,
  detectStravaStub,
} from "./compact.js";

export type { IActivitiesApi } from "./activities.js";
export { ActivitiesApi, createActivitiesApi } from "./activities.js";
export type {
  Activity,
  ActivityInterval,
  ActivityIntervalsDoc,
  ActivityStreams,
  IntervalWrite,
} from "./types.js";
export { decodeFitLaps } from "../fit/index.js";
export type { FitLap } from "../fit/index.js";
export {
  normalizeActivityId,
  compactIntervalAnalysis,
  packStreams,
  detectStravaStub,
} from "./compact.js";

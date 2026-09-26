export type { IActivitiesApi } from "./activities.js";
export { ActivitiesApi, createActivitiesApi } from "./activities.js";
export type {
  Activity,
  ActivityInterval,
  ActivityIntervalsDoc,
  ActivityStreams,
  IntervalWrite,
} from "./types.js";
export { decodeFitLaps } from "./fit-laps.js";
export type { FitLap } from "./fit-laps.js";
export {
  normalizeActivityId,
  compactIntervalAnalysis,
  packStreams,
  detectStravaStub,
} from "./compact.js";

export {
  computeAerobicDecoupling,
  type DecouplingResult,
  type DecouplingHalf,
} from "./decoupling.js";
export {
  computeBestPower,
  formatDuration,
  normalizedPower,
  ROLLING_WINDOW_SECONDS,
} from "./power.js";
export {
  compareIntervals,
  type CompareIntervalsResult,
  type IntervalComparison,
  type IntervalSummary,
  type IntervalFilterOptions,
} from "./intervals.js";
export { createActivityAnalysis } from "./analysis.js";
export type { IActivityAnalysis, ActivityAnalysisDeps } from "./analysis.js";

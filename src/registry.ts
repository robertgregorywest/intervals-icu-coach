import type { ToolDef } from "./tools/define.js";
import { getAthleteTool } from "./tools/athlete.js";
import {
  getActivitiesTool,
  getActivityTool,
  getActivityLapsTool,
  getActivityStreamsTool,
} from "./tools/activities.js";
import {
  getEventsTool,
  getEventTool,
  updateEventTool,
  deleteEventsTool,
} from "./tools/events.js";
import {
  createWorkoutTool,
  scheduleLibraryWorkoutTool,
  createStrengthWorkoutTool,
} from "./tools/workouts.js";
import {
  listWorkoutLibraryTool,
  getWorkoutLibraryItemTool,
  syncWorkoutLibraryTool,
  deleteWorkoutLibraryItemTool,
} from "./tools/workout-library.js";
import { getWellnessTool, getFitnessSummaryTool } from "./tools/wellness.js";
import { getPowerCurveTool } from "./tools/power.js";
import {
  getAerobicDecouplingTool,
  compareIntervalsTool,
} from "./tools/analysis.js";
import { computePowerProfileTool } from "./tools/power-profile.js";
import { comparePlannedVsActualTool } from "./tools/session-review.js";
import { compareIntensityDistributionTool } from "./tools/intensity-distribution.js";
import { getExecutionDigestTool } from "./tools/execution-digest.js";
import { computeTrackLapPowerTool } from "./tools/track-lap-alignment.js";
import { writeTrackRunsTool } from "./tools/track-lap-writeback.js";
import {
  listTrackSessionsTool,
  getTrackSessionTool,
  compareTrackSessionsTool,
} from "./tools/track-sessions.js";
import { getTrainingWeekSummaryTool } from "./tools/training-week.js";
import { getCoachingContextTool } from "./tools/coaching-context.js";
import { forecastTrainingLoadTool } from "./tools/training-load-forecast.js";

export type { ToolDef } from "./tools/define.js";
export {
  READ_ONLY,
  MUTATING,
  DESTRUCTIVE_IDEMPOTENT,
  UPSERT,
} from "./tools/define.js";

/** Every Tool, in the order both adapters list them. */
export const TOOLS: ToolDef[] = [
  getAthleteTool,
  getActivitiesTool,
  getActivityTool,
  getActivityLapsTool,
  getActivityStreamsTool,
  getEventsTool,
  getEventTool,
  updateEventTool,
  deleteEventsTool,
  createWorkoutTool,
  scheduleLibraryWorkoutTool,
  createStrengthWorkoutTool,
  listWorkoutLibraryTool,
  getWorkoutLibraryItemTool,
  syncWorkoutLibraryTool,
  deleteWorkoutLibraryItemTool,
  getWellnessTool,
  getFitnessSummaryTool,
  getPowerCurveTool,
  getAerobicDecouplingTool,
  computePowerProfileTool,
  compareIntervalsTool,
  comparePlannedVsActualTool,
  compareIntensityDistributionTool,
  getExecutionDigestTool,
  computeTrackLapPowerTool,
  writeTrackRunsTool,
  listTrackSessionsTool,
  getTrackSessionTool,
  compareTrackSessionsTool,
  getTrainingWeekSummaryTool,
  getCoachingContextTool,
  forecastTrainingLoadTool,
];
